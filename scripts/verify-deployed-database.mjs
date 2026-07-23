import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const requireFromDatabasePackage = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);

export const REQUIRED_TENANT_RELATIONS = [
  {
    name: 'suppliers_organization_id_default_cost_center_id_fkey',
    tableName: 'suppliers',
    referencedTable: 'cost_centers',
    sourceColumns: ['organization_id', 'default_cost_center_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'supplier_prices_organization_id_supplier_id_fkey',
    tableName: 'supplier_prices',
    referencedTable: 'suppliers',
    sourceColumns: ['organization_id', 'supplier_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'purchases_organization_id_supplier_id_fkey',
    tableName: 'purchases',
    referencedTable: 'suppliers',
    sourceColumns: ['organization_id', 'supplier_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'sheet_sync_runs_organization_id_integration_id_fkey',
    tableName: 'sheet_sync_runs',
    referencedTable: 'google_sheets_integrations',
    sourceColumns: ['organization_id', 'integration_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'purchase_items_organization_id_purchase_id_fkey',
    tableName: 'purchase_items',
    referencedTable: 'purchases',
    sourceColumns: ['organization_id', 'purchase_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'purchase_items_organization_id_cost_center_id_fkey',
    tableName: 'purchase_items',
    referencedTable: 'cost_centers',
    sourceColumns: ['organization_id', 'cost_center_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'cost_allocations_organization_id_purchase_item_id_fkey',
    tableName: 'cost_allocations',
    referencedTable: 'purchase_items',
    sourceColumns: ['organization_id', 'purchase_item_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'cost_allocations_organization_id_cost_center_id_fkey',
    tableName: 'cost_allocations',
    referencedTable: 'cost_centers',
    sourceColumns: ['organization_id', 'cost_center_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'installments_organization_id_purchase_id_fkey',
    tableName: 'installments',
    referencedTable: 'purchases',
    sourceColumns: ['organization_id', 'purchase_id'],
    targetColumns: ['organization_id', 'id'],
  },
  {
    name: 'invoice_documents_organization_id_purchase_id_fkey',
    tableName: 'invoice_documents',
    referencedTable: 'purchases',
    sourceColumns: ['organization_id', 'purchase_id'],
    targetColumns: ['organization_id', 'id'],
  },
];

export function validateDatabaseSecuritySnapshot({
  migrations,
  tableGrants,
  tables,
  tenantRelations,
}) {
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

  const relationByName = new Map(
    (tenantRelations ?? []).map((relation) => [relation.name, relation]),
  );
  const invalidRelations = REQUIRED_TENANT_RELATIONS.filter((expected) => {
    const actual = relationByName.get(expected.name);
    return (
      !actual ||
      actual.tableName !== expected.tableName ||
      actual.referencedTable !== expected.referencedTable ||
      !sameColumns(actual.sourceColumns, expected.sourceColumns) ||
      !sameColumns(actual.targetColumns, expected.targetColumns)
    );
  });
  if (invalidRelations.length > 0) {
    throw new Error(
      `Missing or invalid tenant relation constraints: ${invalidRelations
        .map((relation) => relation.name)
        .join(', ')}.`,
    );
  }

  return {
    migrations: completedMigrations.length,
    protectedTables: tables.length,
    tenantRelations: REQUIRED_TENANT_RELATIONS.length,
  };
}

export async function verifyDeployedDatabase(prisma) {
  const [migrations, tables, tableGrants, tenantRelations] = await Promise.all([
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
    prisma.$queryRawUnsafe(`
      SELECT
        constraint_record.conname AS "name",
        source_table.relname AS "tableName",
        target_table.relname AS "referencedTable",
        ARRAY(
          SELECT source_attribute.attname
          FROM unnest(constraint_record.conkey) WITH ORDINALITY
            AS source_key(attribute_number, position)
          JOIN pg_attribute source_attribute
            ON source_attribute.attrelid = constraint_record.conrelid
           AND source_attribute.attnum = source_key.attribute_number
          ORDER BY source_key.position
        ) AS "sourceColumns",
        ARRAY(
          SELECT target_attribute.attname
          FROM unnest(constraint_record.confkey) WITH ORDINALITY
            AS target_key(attribute_number, position)
          JOIN pg_attribute target_attribute
            ON target_attribute.attrelid = constraint_record.confrelid
           AND target_attribute.attnum = target_key.attribute_number
          ORDER BY target_key.position
        ) AS "targetColumns"
      FROM pg_constraint constraint_record
      JOIN pg_class source_table ON source_table.oid = constraint_record.conrelid
      JOIN pg_class target_table ON target_table.oid = constraint_record.confrelid
      JOIN pg_namespace source_namespace
        ON source_namespace.oid = source_table.relnamespace
      WHERE source_namespace.nspname = 'public'
        AND constraint_record.contype = 'f'
      ORDER BY constraint_record.conname
    `),
  ]);

  return validateDatabaseSecuritySnapshot({
    migrations,
    tableGrants,
    tables,
    tenantRelations,
  });
}

function sameColumns(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((column, index) => column === expected[index])
  );
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required.');
  }
  const { PrismaClient } = requireFromDatabasePackage('@prisma/client');
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
