import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../packages/database/prisma/migrations/202608010001_procure_to_pay_nfe/migration.sql',
  import.meta.url,
);

const protectedTables = [
  'fiscal_integrations',
  'purchase_invoice_links',
  'fiscal_document_items',
  'goods_receipts',
  'goods_receipt_items',
  'receipt_responsibilities',
  'payment_settings',
  'payment_approval_rules',
  'payment_approval_rule_approvers',
  'payment_approval_requests',
  'payment_approval_participants',
  'payment_approval_titles',
  'payment_instruction_snapshots',
  'payment_settlements',
];

test('procure-to-pay migration protects every new tenant table', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of protectedTables) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON TABLE "${table}" FROM PUBLIC, anon, authenticated`),
    );
  }
});

test('procure-to-pay migration preserves legacy links and payment state', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /WHEN "paid_at" IS NOT NULL THEN 'PAID'/);
  assert.match(sql, /INSERT INTO "purchase_invoice_links"/);
  assert.match(
    sql,
    /SELECT "organization_id", "purchase_id", "id", 'MATCHED_MANUAL', 'Vinculo migrado/,
  );
  assert.match(sql, /SET "match_status" = 'MATCHED_MANUAL'\s+WHERE "purchase_id" IS NOT NULL/);
  assert.match(sql, /UPDATE "installments" AS installment\s+SET "fiscal_document_id"/);
  assert.match(sql, /ALTER COLUMN "changed_by_id" DROP NOT NULL/);
});

test('fiscal credentials and payment evidence are private metadata only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /"certificate_encrypted" BYTEA NOT NULL/);
  assert.match(sql, /"certificate_passphrase_encrypted" BYTEA NOT NULL/);
  assert.match(sql, /"proof_storage_path" VARCHAR\(500\) NOT NULL/);
  assert.match(sql, /"advance_evidence_path" VARCHAR\(500\)/);
  assert.doesNotMatch(sql, /bank_password|senha_bancaria/i);
});
