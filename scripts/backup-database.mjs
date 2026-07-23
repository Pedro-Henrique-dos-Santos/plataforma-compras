import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const connection = parseDatabaseUrl(process.env.DATABASE_URL);
const backupDirectory = resolve(process.env.BACKUP_DIRECTORY ?? 'backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputFile = resolve(backupDirectory, `egestao-${timestamp}.dump`);
await mkdir(backupDirectory, { recursive: true });

const environment = {
  ...process.env,
  PGPASSWORD: decodeURIComponent(connection.password),
};
const sslMode = connection.searchParams.get('sslmode');
if (sslMode) environment.PGSSLMODE = sslMode;

await run(process.env.PG_DUMP_BINARY ?? 'pg_dump', [
  '--host',
  connection.hostname,
  '--port',
  connection.port || '5432',
  '--username',
  decodeURIComponent(connection.username),
  '--dbname',
  decodeURIComponent(connection.pathname.slice(1)),
  '--format',
  'custom',
  '--no-owner',
  '--no-acl',
  '--file',
  outputFile,
], environment);

process.stdout.write(`Backup created at ${outputFile}\n`);

function parseDatabaseUrl(value) {
  if (!value) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }
  if (!parsed.hostname || !parsed.username || !parsed.pathname.slice(1)) {
    throw new Error('DATABASE_URL must include host, user and database name.');
  }
  return parsed;
}

function run(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit', windowsHide: true });
    child.once('error', (error) => {
      reject(
        error.code === 'ENOENT'
          ? new Error(`${command} was not found. Install PostgreSQL client tools first.`)
          : error,
      );
    });
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}
