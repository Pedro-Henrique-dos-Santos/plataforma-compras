import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../packages/database/prisma/migrations/202608010002_receivables_workflow_supplier_lookup/migration.sql',
  import.meta.url,
);

test('receivables migration protects every tenant table', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of ['receivables', 'receivable_settlements']) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON TABLE "${table}" FROM PUBLIC, anon, authenticated`),
    );
  }
});

test('receivables migration enforces tenant links and positive values', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(
    sql,
    /FOREIGN KEY \("organization_id", "receivable_id"\)\s+REFERENCES "receivables"\("organization_id", "id"\)/,
  );
  assert.match(sql, /receivables_amount_check" CHECK \("amount" > 0\)/);
  assert.match(sql, /receivable_settlements_amount_check" CHECK \("amount" > 0\)/);
  assert.match(sql, /require_stage_return_reason" BOOLEAN NOT NULL DEFAULT false/);
});

test('supplier enrichment stores only reviewed business fields', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /ADD COLUMN "postal_code" VARCHAR\(8\)/);
  assert.match(sql, /ADD COLUMN "registration_status" VARCHAR\(80\)/);
  assert.match(sql, /ADD COLUMN "primary_activity" VARCHAR\(240\)/);
  assert.doesNotMatch(sql, /api_key|provider_token|provider_payload/i);
});
