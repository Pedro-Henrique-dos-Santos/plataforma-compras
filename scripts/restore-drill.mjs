import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const SAFE_DATABASE_NAME = /^[a-z][a-z0-9_]{2,62}$/;

const METRICS_SQL = `
SELECT json_build_object(
  'appliedMigrations', COALESCE((
    SELECT json_agg(migration_name ORDER BY finished_at)
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  ), '[]'::json),
  'appTableCount', (
    SELECT COUNT(*)::int
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname <> '_prisma_migrations'
  ),
  'rlsEnabledCount', (
    SELECT COUNT(*)::int
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname <> '_prisma_migrations'
      AND relation.relrowsecurity
  ),
  'users', (SELECT COUNT(*)::int FROM users),
  'platformRoles', (SELECT COUNT(*)::int FROM platform_role_assignments),
  'organizations', (SELECT COUNT(*)::int FROM organizations),
  'memberships', (SELECT COUNT(*)::int FROM organization_memberships),
  'costCenters', (SELECT COUNT(*)::int FROM cost_centers),
  'suppliers', (SELECT COUNT(*)::int FROM suppliers),
  'supplierPrices', (SELECT COUNT(*)::int FROM supplier_prices),
  'purchases', (SELECT COUNT(*)::int FROM purchases),
  'purchaseItems', (SELECT COUNT(*)::int FROM purchase_items),
  'costAllocations', (SELECT COUNT(*)::int FROM cost_allocations),
  'installments', (SELECT COUNT(*)::int FROM installments),
  'invoiceDocuments', (SELECT COUNT(*)::int FROM invoice_documents),
  'sheetIntegrations', (SELECT COUNT(*)::int FROM google_sheets_integrations),
  'sheetSyncRuns', (SELECT COUNT(*)::int FROM sheet_sync_runs),
  'auditLogs', (SELECT COUNT(*)::int FROM audit_logs),
  'purchaseTotal', COALESCE((SELECT SUM(total)::text FROM purchases), '0'),
  'savingsTotal', COALESCE((SELECT SUM(negotiated_savings)::text FROM purchases), '0'),
  'allocationTotal', COALESCE((SELECT SUM(amount)::text FROM cost_allocations), '0')
)::text;
`;

export async function runRestoreDrill(environment = process.env) {
  const startedAt = Date.now();
  const connection = parseDatabaseConnection(environment.DATABASE_URL);
  const targetDatabase =
    environment.RESTORE_DRILL_DATABASE_NAME ??
    `egestao_restore_${Date.now()}_${process.pid}`.toLowerCase();
  validateRestoreTarget({
    confirmed: environment.RESTORE_DRILL_CONFIRM === 'true',
    hostname: connection.hostname,
    sourceDatabase: connection.database,
    targetDatabase,
  });

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'egestao-restore-'));
  const backupFile = join(temporaryDirectory, 'database.dump');
  const pgEnvironment = postgresEnvironment(connection, environment);
  const keepBackup = environment.RESTORE_DRILL_KEEP_BACKUP === 'true';
  let targetCreated = false;
  let result;
  let failure;

  try {
    const sourceMetrics = await readMetrics(connection, connection.database, pgEnvironment, environment);
    assertMetricsHealthy(sourceMetrics, environment.RESTORE_DRILL_REQUIRE_DATA === 'true');

    await runProcess(environment.PG_DUMP_BINARY ?? 'pg_dump', [
      ...connectionArguments(connection, connection.database),
      '--format',
      'custom',
      '--no-owner',
      '--no-acl',
      '--file',
      backupFile,
    ], pgEnvironment);

    const backupList = await runProcess(
      environment.PG_RESTORE_BINARY ?? 'pg_restore',
      ['--list', backupFile],
      pgEnvironment,
      true,
    );
    const backupEntries = backupList
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith(';')).length;
    if (!backupEntries) throw new Error('The backup has no restorable entries.');

    await runProcess(environment.CREATEDB_BINARY ?? 'createdb', [
      ...serverArguments(connection),
      targetDatabase,
    ], pgEnvironment);
    targetCreated = true;

    await runProcess(environment.PG_RESTORE_BINARY ?? 'pg_restore', [
      ...connectionArguments(connection, targetDatabase),
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      backupFile,
    ], pgEnvironment);

    const restoredMetrics = await readMetrics(connection, targetDatabase, pgEnvironment, environment);
    assertMetricsHealthy(restoredMetrics, environment.RESTORE_DRILL_REQUIRE_DATA === 'true');
    assertMetricsEquivalent(sourceMetrics, restoredMetrics);

    result = {
      backupEntries,
      durationMs: Date.now() - startedAt,
      migrations: sourceMetrics.appliedMigrations.length,
      organizations: sourceMetrics.organizations,
      purchases: sourceMetrics.purchases,
      status: 'verified',
      targetDatabase,
    };
  } catch (error) {
    failure = error;
  }

  if (targetCreated) {
    try {
      await runProcess(environment.DROPDB_BINARY ?? 'dropdb', [
        ...serverArguments(connection),
        '--if-exists',
        '--force',
        targetDatabase,
      ], pgEnvironment);
    } catch (error) {
      if (!failure) failure = error;
      else process.stderr.write(`Restore drill cleanup warning: ${errorMessage(error)}\n`);
    }
  }

  if (!keepBackup) {
    try {
      await rm(temporaryDirectory, { force: true, recursive: true });
    } catch (error) {
      if (!failure) failure = error;
      else process.stderr.write(`Restore drill file cleanup warning: ${errorMessage(error)}\n`);
    }
  } else if (result) {
    result.backupFile = backupFile;
  }

  if (failure) throw failure;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function parseDatabaseConnection(value) {
  if (!value) throw new Error('DATABASE_URL is required.');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DATABASE_URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!parsed.hostname || !parsed.username || !database || database.includes('/')) {
    throw new Error('DATABASE_URL must include host, user and one database name.');
  }
  return {
    database,
    hostname: parsed.hostname,
    password: decodeURIComponent(parsed.password),
    port: parsed.port || '5432',
    sslMode: parsed.searchParams.get('sslmode'),
    username: decodeURIComponent(parsed.username),
  };
}

export function validateRestoreTarget({
  confirmed,
  hostname,
  sourceDatabase,
  targetDatabase,
}) {
  if (!SAFE_DATABASE_NAME.test(targetDatabase)) {
    throw new Error('RESTORE_DRILL_DATABASE_NAME must use lowercase letters, digits and underscores.');
  }
  if (['postgres', 'template0', 'template1', sourceDatabase].includes(targetDatabase)) {
    throw new Error('The restore target must be a separate disposable database.');
  }
  if (!LOCAL_HOSTS.has(hostname) && !confirmed) {
    throw new Error('Set RESTORE_DRILL_CONFIRM=true before running against a remote PostgreSQL host.');
  }
}

export function assertMetricsHealthy(metrics, requireData = false) {
  if (!Array.isArray(metrics.appliedMigrations) || !metrics.appliedMigrations.length) {
    throw new Error('No completed Prisma migrations were found.');
  }
  if (metrics.appTableCount < 15 || metrics.rlsEnabledCount !== metrics.appTableCount) {
    throw new Error('The restored schema does not preserve RLS on every application table.');
  }
  if (
    requireData &&
    (!metrics.organizations || !metrics.suppliers || !metrics.purchases || !metrics.purchaseItems)
  ) {
    throw new Error('The recovery fixture is incomplete.');
  }
}

export function assertMetricsEquivalent(source, restored) {
  if (isDeepStrictEqual(source, restored)) return;
  const keys = [...new Set([...Object.keys(source), ...Object.keys(restored)])]
    .filter((key) => !isDeepStrictEqual(source[key], restored[key]))
    .sort();
  throw new Error(`Restored metrics differ from the source: ${keys.join(', ')}.`);
}

async function readMetrics(connection, database, pgEnvironment, environment) {
  const output = await runProcess(
    environment.PSQL_BINARY ?? 'psql',
    [
      ...connectionArguments(connection, database),
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      '--set=ON_ERROR_STOP=1',
      '--command',
      METRICS_SQL,
    ],
    pgEnvironment,
    true,
  );
  try {
    return JSON.parse(output.trim());
  } catch {
    throw new Error('Could not parse the PostgreSQL recovery metrics.');
  }
}

function postgresEnvironment(connection, environment) {
  return {
    ...environment,
    ...(connection.password && { PGPASSWORD: connection.password }),
    ...(connection.sslMode && { PGSSLMODE: connection.sslMode }),
  };
}

function serverArguments(connection) {
  return [
    '--host',
    connection.hostname,
    '--port',
    connection.port,
    '--username',
    connection.username,
  ];
}

function connectionArguments(connection, database) {
  return [...serverArguments(connection), '--dbname', database];
}

function runProcess(command, args, environment, capture = false) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env: environment,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }
    child.once('error', (error) => {
      reject(
        error.code === 'ENOENT'
          ? new Error(`${command} was not found. Install PostgreSQL client tools first.`)
          : error,
      );
    });
    child.once('exit', (code) => {
      if (code === 0) resolveRun(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await runRestoreDrill();
