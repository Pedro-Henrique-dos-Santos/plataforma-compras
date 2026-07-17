import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaClient } from '../packages/database/dist/index.js';

export function validateDatabaseSecuritySnapshot({ migrations, tableGrants, tables }) {
  if (!Array.isArray(migrations) || migrations.length === 0) {
    throw new Error('No completed Prisma migrations were found.');
  }
  const incompleteMigrations = migrations.filter(
    (migration) => !migration.finishedAt && !migration.rolledBackAt,
  );
  if (incompleteMigrations.length > 0) {
    throw new Error(
      `Incomplete Prisma migrations: ${incompleteMigrations
        .map((migration) => migration.name)
      .join(', ')}.`,
    );
  }
  const completedMigrations = migrations.filter((migration) => migration.finishedAt);
  if (completedMigrations.length === 0) {
    throw new Error('No completed Prisma migrations were found.');
  }

  if (!Array.isArray(tables) || tables.length === 0) {
    throw new Error('No application tables were found in the public schema.');
  }
  const unprotectedTables = tables.filter((table) => !table.rlsEnabled);
  if (unprotectedTables.length > 0) {
    throw new Error(
      `Application tables without RLS: ${unprotectedTables.map((table) => table.name).join(', ')}.`,
    );
  }

  if (tableGrants.length > 0) {
    throw new Error(
      `Browser-reachable table privileges remain: ${tableGrants
        .map((grant) => `${grant.grantee}:${grant.tableName}:${grant.privilege}`)
        .join(', ')}.`,
    );
  }

  return {
    migrations: completedMigrations.length,
    protectedTables: tables.length,
  };
}

export async function verifyDeployedDatabase(prisma) {
  const [migrations, tables, tableGrants] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT
        migration_name AS "name",
        finished_at AS "finishedAt",
        rolled_back_at AS "rolledBackAt"
      FROM _prisma_migrations
      ORDER BY started_at
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        relation.relname AS "name",
        relation.relrowsecurity AS "rlsEnabled"
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind = 'r'
        AND relation.relname <> '_prisma_migrations'
      ORDER BY relation.relname
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        grantee,
        table_name AS "tableName",
        privilege_type AS "privilege"
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('PUBLIC', 'anon', 'authenticated')
      ORDER BY grantee, table_name, privilege_type
    `),
  ]);

  return validateDatabaseSecuritySnapshot({ migrations, tableGrants, tables });
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required.');
  }
  const prisma = new PrismaClient();
  try {
    const result = await verifyDeployedDatabase(prisma);
    process.stdout.write(`${JSON.stringify({ status: 'verified', ...result })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
