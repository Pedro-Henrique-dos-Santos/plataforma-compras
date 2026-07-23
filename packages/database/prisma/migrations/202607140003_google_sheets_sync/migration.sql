ALTER TABLE "purchases"
ADD COLUMN "invoice_number" VARCHAR(60);

CREATE UNIQUE INDEX "purchases_organization_id_supplier_id_invoice_number_key"
ON "purchases"("organization_id", "supplier_id", "invoice_number");

CREATE TYPE "IntegrationHealth" AS ENUM ('NEVER_SYNCED', 'HEALTHY', 'ERROR');
CREATE TYPE "SheetSyncRunStatus" AS ENUM ('PREVIEWED', 'APPLYING', 'APPLIED', 'FAILED');

CREATE TABLE "google_sheets_integrations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "spreadsheet_id" VARCHAR(160) NOT NULL,
  "spreadsheet_title" VARCHAR(160),
  "items_sheet_name" VARCHAR(120) NOT NULL DEFAULT 'Itens do Pedido',
  "installments_sheet_name" VARCHAR(120) NOT NULL DEFAULT 'Parcelas do Pedido',
  "suppliers_sheet_name" VARCHAR(120) NOT NULL DEFAULT 'Cadastro de Fornecedores',
  "prices_sheet_name" VARCHAR(120) NOT NULL DEFAULT 'Tabela de Precos Negociados',
  "header_row" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_status" "IntegrationHealth" NOT NULL DEFAULT 'NEVER_SYNCED',
  "last_synced_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_sheets_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sheet_sync_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "created_by_id" UUID,
  "status" "SheetSyncRunStatus" NOT NULL DEFAULT 'PREVIEWED',
  "snapshot_hash" CHAR(64) NOT NULL,
  "source_row_count" INTEGER NOT NULL,
  "preview" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_at" TIMESTAMP(3),
  CONSTRAINT "sheet_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_sheets_integrations_organization_id_key"
ON "google_sheets_integrations"("organization_id");
CREATE INDEX "sheet_sync_runs_organization_id_created_at_idx"
ON "sheet_sync_runs"("organization_id", "created_at");
CREATE INDEX "sheet_sync_runs_integration_id_status_idx"
ON "sheet_sync_runs"("integration_id", "status");

ALTER TABLE "google_sheets_integrations"
ADD CONSTRAINT "google_sheets_integrations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sheet_sync_runs"
ADD CONSTRAINT "sheet_sync_runs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sheet_sync_runs"
ADD CONSTRAINT "sheet_sync_runs_integration_id_fkey"
FOREIGN KEY ("integration_id") REFERENCES "google_sheets_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sheet_sync_runs"
ADD CONSTRAINT "sheet_sync_runs_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
