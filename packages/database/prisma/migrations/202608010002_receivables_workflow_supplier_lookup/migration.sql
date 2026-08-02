-- Configurable purchase returns, enriched suppliers and accounts receivable.
ALTER TABLE "approval_settings"
  ADD COLUMN "require_stage_return_reason" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "suppliers"
  ADD COLUMN "postal_code" VARCHAR(8),
  ADD COLUMN "street" VARCHAR(160),
  ADD COLUMN "address_number" VARCHAR(30),
  ADD COLUMN "address_complement" VARCHAR(100),
  ADD COLUMN "district" VARCHAR(100),
  ADD COLUMN "city" VARCHAR(100),
  ADD COLUMN "state" CHAR(2),
  ADD COLUMN "registration_status" VARCHAR(80),
  ADD COLUMN "primary_activity" VARCHAR(240),
  ADD CONSTRAINT "suppliers_postal_code_check"
    CHECK ("postal_code" IS NULL OR "postal_code" ~ '^[0-9]{8}$'),
  ADD CONSTRAINT "suppliers_state_check"
    CHECK ("state" IS NULL OR "state" ~ '^[A-Z]{2}$');

CREATE TYPE "ReceivableStatus" AS ENUM (
  'OPEN',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED'
);

CREATE TYPE "ReceivableSource" AS ENUM (
  'MANUAL',
  'INVOICE',
  'IMPORT',
  'SALE'
);

CREATE TABLE "receivables" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "customer_name" VARCHAR(160) NOT NULL,
  "customer_document" VARCHAR(18),
  "description" VARCHAR(240) NOT NULL,
  "category" VARCHAR(100),
  "document_number" VARCHAR(80),
  "invoice_number" VARCHAR(80),
  "issued_at" DATE,
  "due_date" DATE NOT NULL,
  "expected_at" DATE,
  "amount" DECIMAL(14,2) NOT NULL,
  "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
  "source" "ReceivableSource" NOT NULL DEFAULT 'MANUAL',
  "notes" TEXT,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receivables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receivables_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "receivables_dates_check"
    CHECK ("issued_at" IS NULL OR "due_date" >= "issued_at")
);

CREATE TABLE "receivable_settlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "receivable_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "received_at" DATE NOT NULL,
  "transaction_id" VARCHAR(120),
  "notes" VARCHAR(500),
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receivable_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receivable_settlements_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "receivables_organization_id_id_key"
  ON "receivables"("organization_id", "id");
CREATE INDEX "receivables_organization_id_status_due_date_idx"
  ON "receivables"("organization_id", "status", "due_date");
CREATE INDEX "receivables_organization_id_customer_name_idx"
  ON "receivables"("organization_id", "customer_name");
CREATE UNIQUE INDEX "receivable_settlements_organization_id_id_key"
  ON "receivable_settlements"("organization_id", "id");
CREATE UNIQUE INDEX "receivable_settlements_organization_id_transaction_id_key"
  ON "receivable_settlements"("organization_id", "transaction_id");
CREATE INDEX "receivable_settlements_organization_id_receivable_id_received_at_idx"
  ON "receivable_settlements"("organization_id", "receivable_id", "received_at");

ALTER TABLE "receivables"
  ADD CONSTRAINT "receivables_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "receivables_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivable_settlements"
  ADD CONSTRAINT "receivable_settlements_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "receivable_settlements_organization_id_receivable_id_fkey"
    FOREIGN KEY ("organization_id", "receivable_id")
    REFERENCES "receivables"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "receivable_settlements_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receivables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receivable_settlements" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "receivables" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "receivable_settlements" FROM PUBLIC, anon, authenticated;
