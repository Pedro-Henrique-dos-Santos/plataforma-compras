import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fiscalRequirementMigration = new URL(
  '../packages/database/prisma/migrations/202608020001_purchase_fiscal_requirement/migration.sql',
  import.meta.url,
);
const displaySequenceMigration = new URL(
  '../packages/database/prisma/migrations/202608020002_purchase_display_sequence/migration.sql',
  import.meta.url,
);
const auditHistoryMigration = new URL(
  '../packages/database/prisma/migrations/202608020003_purchase_audit_history/migration.sql',
  import.meta.url,
);

test('new and migrated purchases require a fiscal document by default', async () => {
  const sql = await readFile(fiscalRequirementMigration, 'utf8');
  assert.match(
    sql,
    /ADD COLUMN "fiscal_document_required" BOOLEAN NOT NULL DEFAULT true/,
  );
});

test('friendly purchase numbers are deterministic and isolated by organization', async () => {
  const sql = await readFile(displaySequenceMigration, 'utf8');
  assert.match(sql, /PARTITION BY "organization_id"/);
  assert.match(
    sql,
    /ORDER BY "issued_at" ASC NULLS LAST, "created_at" ASC, "id" ASC/,
  );
  assert.match(sql, /ALTER COLUMN "display_sequence" SET NOT NULL/);
  assert.match(
    sql,
    /ON "purchases"\("organization_id", "display_sequence"\)/,
  );
});

test('purchase audit queries have an organization and event index', async () => {
  const sql = await readFile(auditHistoryMigration, 'utf8');
  assert.match(
    sql,
    /ON "audit_logs"\("organization_id", "resource", "created_at"\)/,
  );
});
