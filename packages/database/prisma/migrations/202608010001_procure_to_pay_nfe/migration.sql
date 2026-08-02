-- Integrated purchase, NF-e, receipt and payment workflow.
ALTER TYPE "OrganizationRole" ADD VALUE IF NOT EXISTS 'FINANCE';

ALTER TABLE "purchase_stage_history" ALTER COLUMN "changed_by_id" DROP NOT NULL;
ALTER TABLE "purchase_stage_history"
  DROP CONSTRAINT "purchase_stage_history_changed_by_id_fkey",
  ADD CONSTRAINT "purchase_stage_history_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "PaymentWorkflowStage" AS ENUM (
  'MATCHING_REQUIRED',
  'AWAITING_APPROVAL',
  'READY_TO_PAY',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED'
);
CREATE TYPE "PaymentApprovalMode" AS ENUM (
  'DISABLED',
  'PER_TITLE',
  'PER_PURCHASE_SNAPSHOT'
);
CREATE TYPE "FiscalEnvironment" AS ENUM ('HOMOLOGATION', 'PRODUCTION');
CREATE TYPE "FiscalIntegrationStatus" AS ENUM (
  'NOT_CONFIGURED',
  'READY',
  'SYNCING',
  'BACKOFF',
  'CERTIFICATE_EXPIRED',
  'ERROR'
);
CREATE TYPE "RecipientManifestationMode" AS ENUM ('MANUAL', 'AUTO_SCIENCE');
CREATE TYPE "RecipientManifestation" AS ENUM (
  'SCIENCE',
  'CONFIRMATION',
  'UNKNOWN_OPERATION',
  'OPERATION_NOT_PERFORMED'
);
CREATE TYPE "FiscalDocumentSource" AS ENUM ('UPLOAD', 'SEFAZ');
CREATE TYPE "FiscalMatchStatus" AS ENUM (
  'UNMATCHED',
  'MATCHED_EXACT',
  'MATCHED_MANUAL',
  'REVIEW_REQUIRED',
  'REJECTED'
);
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

ALTER TABLE "suppliers"
  ADD COLUMN "pix_beneficiary_name" VARCHAR(160),
  ADD COLUMN "pix_beneficiary_document" VARCHAR(18);

ALTER TABLE "invoice_documents"
  ADD COLUMN "source" "FiscalDocumentSource" NOT NULL DEFAULT 'UPLOAD',
  ADD COLUMN "sefaz_nsu" VARCHAR(30),
  ADD COLUMN "fiscal_model" VARCHAR(10),
  ADD COLUMN "issuer_document" VARCHAR(18),
  ADD COLUMN "recipient_document" VARCHAR(18),
  ADD COLUMN "fiscal_issued_at" TIMESTAMP(3),
  ADD COLUMN "fiscal_total" DECIMAL(14,2),
  ADD COLUMN "match_status" "FiscalMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  ADD COLUMN "manifestation" "RecipientManifestation",
  ADD COLUMN "manifested_at" TIMESTAMP(3);

ALTER TABLE "installments"
  ADD COLUMN "fiscal_document_id" UUID,
  ADD COLUMN "payment_stage" "PaymentWorkflowStage" NOT NULL DEFAULT 'MATCHING_REQUIRED',
  ADD COLUMN "advance_payment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "advance_reason" VARCHAR(500),
  ADD COLUMN "advance_evidence_path" VARCHAR(500),
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3);

UPDATE "installments"
SET
  "payment_stage" = CASE
    WHEN "paid_at" IS NOT NULL THEN 'PAID'::"PaymentWorkflowStage"
    ELSE 'MATCHING_REQUIRED'::"PaymentWorkflowStage"
  END,
  "updated_at" = CURRENT_TIMESTAMP;

ALTER TABLE "installments"
  ALTER COLUMN "updated_at" SET NOT NULL;

CREATE TABLE "fiscal_integrations" (
  "organization_id" UUID NOT NULL,
  "environment" "FiscalEnvironment" NOT NULL DEFAULT 'HOMOLOGATION',
  "taxpayer_document" VARCHAR(18) NOT NULL,
  "certificate_encrypted" BYTEA NOT NULL,
  "certificate_passphrase_encrypted" BYTEA NOT NULL,
  "certificate_fingerprint" VARCHAR(128) NOT NULL,
  "certificate_expires_at" TIMESTAMP(3) NOT NULL,
  "status" "FiscalIntegrationStatus" NOT NULL DEFAULT 'READY',
  "manifestation_mode" "RecipientManifestationMode" NOT NULL DEFAULT 'MANUAL',
  "last_nsu" VARCHAR(30) NOT NULL DEFAULT '000000000000000',
  "max_nsu" VARCHAR(30) NOT NULL DEFAULT '000000000000000',
  "last_synced_at" TIMESTAMP(3),
  "next_poll_at" TIMESTAMP(3),
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fiscal_integrations_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE "purchase_invoice_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "invoice_document_id" UUID NOT NULL,
  "match_status" "FiscalMatchStatus" NOT NULL,
  "matched_by_id" UUID,
  "match_reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_invoice_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_document_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "invoice_document_id" UUID NOT NULL,
  "matched_purchase_item_id" UUID,
  "sequence" INTEGER NOT NULL,
  "item_code" VARCHAR(80),
  "purchase_reference" VARCHAR(80),
  "description" VARCHAR(240) NOT NULL,
  "quantity" DECIMAL(14,4) NOT NULL,
  "unit" VARCHAR(30),
  "unit_price" DECIMAL(14,4) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "fiscal_document_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_document_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "fiscal_document_items_values_check" CHECK ("unit_price" >= 0 AND "total" >= 0)
);

CREATE TABLE "goods_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'CONFIRMED',
  "received_at" DATE NOT NULL,
  "confirmed_by_id" UUID NOT NULL,
  "notes" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goods_receipt_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "purchase_item_id" UUID NOT NULL,
  "invoice_document_item_id" UUID,
  "quantity" DECIMAL(14,4) NOT NULL,
  CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goods_receipt_items_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "receipt_responsibilities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "cost_center_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receipt_responsibilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_settings" (
  "organization_id" UUID NOT NULL,
  "approval_mode" "PaymentApprovalMode" NOT NULL DEFAULT 'DISABLED',
  "segregation_enabled" BOOLEAN NOT NULL DEFAULT false,
  "notification_channel" "NotificationChannel",
  "notification_recipient" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "payment_settings_notification_pair_check" CHECK (
    ("notification_channel" IS NULL AND "notification_recipient" IS NULL)
    OR ("notification_channel" IS NOT NULL AND "notification_recipient" IS NOT NULL)
  )
);

CREATE TABLE "payment_approval_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "minimum_amount" DECIMAL(14,2) NOT NULL,
  "required_approvals" INTEGER NOT NULL,
  "notification_channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_approval_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_approval_rules_minimum_check" CHECK ("minimum_amount" >= 0),
  CONSTRAINT "payment_approval_rules_quorum_check" CHECK ("required_approvals" BETWEEN 1 AND 2)
);

CREATE TABLE "payment_approval_rule_approvers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_approval_rule_approvers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_approval_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "submitted_by_id" UUID NOT NULL,
  "mode" "PaymentApprovalMode" NOT NULL,
  "rule_name_snapshot" VARCHAR(120) NOT NULL,
  "amount_snapshot" DECIMAL(14,2) NOT NULL,
  "required_approvals" INTEGER NOT NULL,
  "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "payment_approval_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_approval_requests_quorum_check" CHECK ("required_approvals" BETWEEN 1 AND 2),
  CONSTRAINT "payment_approval_requests_resolution_check" CHECK (
    ("status" = 'PENDING' AND "resolved_at" IS NULL)
    OR ("status" <> 'PENDING' AND "resolved_at" IS NOT NULL)
  )
);

CREATE TABLE "payment_approval_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name_snapshot" VARCHAR(120) NOT NULL,
  "recipient_snapshot" VARCHAR(255) NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "decision" "ApprovalDecisionStatus" NOT NULL DEFAULT 'PENDING',
  "comment" VARCHAR(500),
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_approval_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_approval_participants_rejection_check" CHECK (
    "decision" <> 'REJECTED' OR LENGTH(BTRIM("comment")) >= 3
  )
);

CREATE TABLE "payment_approval_titles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "installment_id" UUID NOT NULL,
  "amount_snapshot" DECIMAL(14,2) NOT NULL,
  "instruction_fingerprint" CHAR(64) NOT NULL,
  CONSTRAINT "payment_approval_titles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_instruction_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "installment_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "payment_channel" "PaymentChannel" NOT NULL,
  "payment_reference" VARCHAR(500),
  "pix_key_type" "PixKeyType",
  "pix_key" VARCHAR(160),
  "beneficiary_name" VARCHAR(160),
  "beneficiary_document" VARCHAR(18),
  "pix_copy_paste" VARCHAR(1000),
  "pix_qr_storage_path" VARCHAR(500),
  "pix_qr_file_name" VARCHAR(255),
  "pix_qr_sha256" CHAR(64),
  "notes" VARCHAR(500),
  "validation_warnings" JSONB NOT NULL DEFAULT '[]',
  "fingerprint" CHAR(64) NOT NULL,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_instruction_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_instruction_pix_check" CHECK (
    "payment_channel" <> 'PIX'
    OR "pix_key" IS NOT NULL
    OR "pix_copy_paste" IS NOT NULL
  )
);

CREATE TABLE "payment_settlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "installment_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "paid_at" DATE NOT NULL,
  "transaction_id" VARCHAR(160) NOT NULL,
  "proof_file_name" VARCHAR(255) NOT NULL,
  "proof_mime_type" VARCHAR(100) NOT NULL,
  "proof_size" INTEGER NOT NULL,
  "proof_sha256" CHAR(64) NOT NULL,
  "proof_storage_path" VARCHAR(500) NOT NULL,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_settlements_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payment_settlements_size_check" CHECK ("proof_size" > 0)
);

CREATE UNIQUE INDEX "installments_organization_id_id_key" ON "installments"("organization_id", "id");
CREATE INDEX "installments_organization_id_payment_stage_due_date_idx" ON "installments"("organization_id", "payment_stage", "due_date");
CREATE INDEX "installments_organization_id_fiscal_document_id_idx" ON "installments"("organization_id", "fiscal_document_id");
CREATE UNIQUE INDEX "invoice_documents_organization_id_id_key" ON "invoice_documents"("organization_id", "id");

WITH duplicate_access_keys AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "organization_id", "access_key" ORDER BY "created_at", "id"
  ) AS position
  FROM "invoice_documents"
  WHERE "access_key" IS NOT NULL
)
UPDATE "invoice_documents" AS document
SET "access_key" = NULL, "match_status" = 'REVIEW_REQUIRED'
FROM duplicate_access_keys
WHERE document."id" = duplicate_access_keys."id"
  AND duplicate_access_keys.position > 1;

CREATE UNIQUE INDEX "invoice_documents_organization_id_access_key_key" ON "invoice_documents"("organization_id", "access_key");
CREATE UNIQUE INDEX "invoice_documents_organization_id_sefaz_nsu_key" ON "invoice_documents"("organization_id", "sefaz_nsu");
CREATE INDEX "invoice_documents_organization_id_match_status_created_at_idx" ON "invoice_documents"("organization_id", "match_status", "created_at");
CREATE INDEX "fiscal_integrations_status_next_poll_at_idx" ON "fiscal_integrations"("status", "next_poll_at");
CREATE UNIQUE INDEX "purchase_invoice_links_org_purchase_invoice_key" ON "purchase_invoice_links"("organization_id", "purchase_id", "invoice_document_id");
CREATE INDEX "purchase_invoice_links_org_invoice_idx" ON "purchase_invoice_links"("organization_id", "invoice_document_id");
CREATE UNIQUE INDEX "fiscal_document_items_org_id_key" ON "fiscal_document_items"("organization_id", "id");
CREATE UNIQUE INDEX "fiscal_document_items_org_document_sequence_key" ON "fiscal_document_items"("organization_id", "invoice_document_id", "sequence");
CREATE INDEX "fiscal_document_items_org_purchase_item_idx" ON "fiscal_document_items"("organization_id", "matched_purchase_item_id");
CREATE UNIQUE INDEX "goods_receipts_org_id_key" ON "goods_receipts"("organization_id", "id");
CREATE INDEX "goods_receipts_org_purchase_received_idx" ON "goods_receipts"("organization_id", "purchase_id", "received_at");
CREATE UNIQUE INDEX "goods_receipt_items_receipt_purchase_invoice_key" ON "goods_receipt_items"("receipt_id", "purchase_item_id", "invoice_document_item_id");
CREATE INDEX "goods_receipt_items_org_purchase_item_idx" ON "goods_receipt_items"("organization_id", "purchase_item_id");
CREATE INDEX "goods_receipt_items_org_invoice_item_idx" ON "goods_receipt_items"("organization_id", "invoice_document_item_id");
CREATE UNIQUE INDEX "receipt_responsibilities_scoped_key" ON "receipt_responsibilities"("organization_id", "user_id", "cost_center_id");
CREATE UNIQUE INDEX "receipt_responsibilities_org_level_key" ON "receipt_responsibilities"("organization_id", "user_id") WHERE "cost_center_id" IS NULL;
CREATE INDEX "receipt_responsibilities_org_cost_center_idx" ON "receipt_responsibilities"("organization_id", "cost_center_id");
CREATE UNIQUE INDEX "payment_approval_rules_org_minimum_key" ON "payment_approval_rules"("organization_id", "minimum_amount");
CREATE UNIQUE INDEX "payment_approval_rules_org_id_key" ON "payment_approval_rules"("organization_id", "id");
CREATE INDEX "payment_approval_rules_org_active_minimum_idx" ON "payment_approval_rules"("organization_id", "active", "minimum_amount");
CREATE UNIQUE INDEX "payment_rule_approvers_org_rule_user_key" ON "payment_approval_rule_approvers"("organization_id", "rule_id", "user_id");
CREATE INDEX "payment_rule_approvers_org_user_idx" ON "payment_approval_rule_approvers"("organization_id", "user_id");
CREATE UNIQUE INDEX "payment_approval_requests_org_id_key" ON "payment_approval_requests"("organization_id", "id");
CREATE INDEX "payment_approval_requests_org_purchase_status_idx" ON "payment_approval_requests"("organization_id", "purchase_id", "status");
CREATE INDEX "payment_approval_requests_org_submitted_idx" ON "payment_approval_requests"("organization_id", "submitted_at");
CREATE UNIQUE INDEX "payment_participants_org_request_user_key" ON "payment_approval_participants"("organization_id", "request_id", "user_id");
CREATE INDEX "payment_participants_org_user_decision_idx" ON "payment_approval_participants"("organization_id", "user_id", "decision");
CREATE UNIQUE INDEX "payment_titles_org_request_installment_key" ON "payment_approval_titles"("organization_id", "request_id", "installment_id");
CREATE INDEX "payment_titles_org_installment_idx" ON "payment_approval_titles"("organization_id", "installment_id");
CREATE UNIQUE INDEX "payment_instructions_org_installment_version_key" ON "payment_instruction_snapshots"("organization_id", "installment_id", "version");
CREATE INDEX "payment_instructions_org_installment_created_idx" ON "payment_instruction_snapshots"("organization_id", "installment_id", "created_at");
CREATE UNIQUE INDEX "payment_settlements_org_installment_transaction_key" ON "payment_settlements"("organization_id", "installment_id", "transaction_id");
CREATE UNIQUE INDEX "payment_settlements_org_proof_hash_key" ON "payment_settlements"("organization_id", "proof_sha256");
CREATE INDEX "payment_settlements_org_paid_at_idx" ON "payment_settlements"("organization_id", "paid_at");

ALTER TABLE "fiscal_integrations" ADD CONSTRAINT "fiscal_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_invoice_links"
  ADD CONSTRAINT "purchase_invoice_links_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_invoice_links_org_purchase_fkey" FOREIGN KEY ("organization_id", "purchase_id") REFERENCES "purchases"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_invoice_links_org_invoice_fkey" FOREIGN KEY ("organization_id", "invoice_document_id") REFERENCES "invoice_documents"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_invoice_links_matched_by_fkey" FOREIGN KEY ("matched_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_document_items"
  ADD CONSTRAINT "fiscal_document_items_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "fiscal_document_items_org_document_fkey" FOREIGN KEY ("organization_id", "invoice_document_id") REFERENCES "invoice_documents"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "fiscal_document_items_org_purchase_item_fkey" FOREIGN KEY ("organization_id", "matched_purchase_item_id") REFERENCES "purchase_items"("organization_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipts_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "goods_receipts_org_purchase_fkey" FOREIGN KEY ("organization_id", "purchase_id") REFERENCES "purchases"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "goods_receipts_confirmed_by_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items"
  ADD CONSTRAINT "goods_receipt_items_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "goods_receipt_items_org_receipt_fkey" FOREIGN KEY ("organization_id", "receipt_id") REFERENCES "goods_receipts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "goods_receipt_items_org_purchase_item_fkey" FOREIGN KEY ("organization_id", "purchase_item_id") REFERENCES "purchase_items"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "goods_receipt_items_org_invoice_item_fkey" FOREIGN KEY ("organization_id", "invoice_document_item_id") REFERENCES "fiscal_document_items"("organization_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "receipt_responsibilities"
  ADD CONSTRAINT "receipt_responsibilities_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "receipt_responsibilities_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "receipt_responsibilities_org_cost_center_fkey" FOREIGN KEY ("organization_id", "cost_center_id") REFERENCES "cost_centers"("organization_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_approval_rules" ADD CONSTRAINT "payment_approval_rules_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_approval_rule_approvers"
  ADD CONSTRAINT "payment_rule_approvers_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_rule_approvers_org_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "payment_approval_rules"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_rule_approvers_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_approval_requests"
  ADD CONSTRAINT "payment_requests_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_requests_org_purchase_fkey" FOREIGN KEY ("organization_id", "purchase_id") REFERENCES "purchases"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_requests_org_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "payment_approval_rules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_requests_submitter_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_approval_participants"
  ADD CONSTRAINT "payment_participants_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_participants_org_request_fkey" FOREIGN KEY ("organization_id", "request_id") REFERENCES "payment_approval_requests"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_participants_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_approval_titles"
  ADD CONSTRAINT "payment_titles_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_titles_org_request_fkey" FOREIGN KEY ("organization_id", "request_id") REFERENCES "payment_approval_requests"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_titles_org_installment_fkey" FOREIGN KEY ("organization_id", "installment_id") REFERENCES "installments"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_instruction_snapshots"
  ADD CONSTRAINT "payment_instructions_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_instructions_org_installment_fkey" FOREIGN KEY ("organization_id", "installment_id") REFERENCES "installments"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_instructions_creator_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_settlements"
  ADD CONSTRAINT "payment_settlements_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_settlements_org_installment_fkey" FOREIGN KEY ("organization_id", "installment_id") REFERENCES "installments"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_settlements_creator_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_org_fiscal_document_fkey" FOREIGN KEY ("organization_id", "fiscal_document_id") REFERENCES "invoice_documents"("organization_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

INSERT INTO "purchase_invoice_links" (
  "organization_id", "purchase_id", "invoice_document_id", "match_status", "match_reason"
)
SELECT "organization_id", "purchase_id", "id", 'MATCHED_MANUAL', 'Vinculo migrado do documento fiscal existente.'
FROM "invoice_documents"
WHERE "purchase_id" IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE "invoice_documents"
SET "match_status" = 'MATCHED_MANUAL'
WHERE "purchase_id" IS NOT NULL;

UPDATE "installments" AS installment
SET "fiscal_document_id" = single_document."invoice_document_id"
FROM (
  SELECT "organization_id", "purchase_id", MIN("invoice_document_id"::text)::uuid AS "invoice_document_id"
  FROM "purchase_invoice_links"
  GROUP BY "organization_id", "purchase_id"
  HAVING COUNT(*) = 1
) AS single_document
WHERE installment."organization_id" = single_document."organization_id"
  AND installment."purchase_id" = single_document."purchase_id";

ALTER TABLE "fiscal_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_invoice_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_document_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goods_receipt_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receipt_responsibilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_approval_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_approval_rule_approvers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_approval_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_approval_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_approval_titles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_instruction_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_settlements" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "fiscal_integrations" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "purchase_invoice_links" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "fiscal_document_items" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "goods_receipts" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "goods_receipt_items" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "receipt_responsibilities" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "payment_settings" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "payment_approval_rules" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "payment_approval_rule_approvers" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "payment_approval_requests" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "payment_approval_participants" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "payment_approval_titles" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "payment_instruction_snapshots" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "payment_settlements" FROM PUBLIC, anon, authenticated;
