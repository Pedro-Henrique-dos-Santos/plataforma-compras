CREATE TYPE "InvoiceDocumentStatus" AS ENUM (
  'PROCESSING',
  'REVIEW_REQUIRED',
  'READY',
  'OUT_OF_SCOPE',
  'IMPORTING',
  'IMPORTED',
  'FAILED'
);

CREATE TYPE "InvoiceDocumentKind" AS ENUM ('PDF', 'XML');

ALTER TABLE "invoice_documents"
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "imported_by_id" UUID,
  ADD COLUMN "kind" "InvoiceDocumentKind",
  ADD COLUMN "size" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sha256" CHAR(64),
  ADD COLUMN "status" "InvoiceDocumentStatus" NOT NULL DEFAULT 'PROCESSING',
  ADD COLUMN "review_data" JSONB,
  ADD COLUMN "warnings" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "errors" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "processed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "imported_at" TIMESTAMP(3);

UPDATE "invoice_documents"
SET "kind" = CASE
  WHEN LOWER("mime_type") LIKE '%xml%' THEN 'XML'::"InvoiceDocumentKind"
  ELSE 'PDF'::"InvoiceDocumentKind"
END
WHERE "kind" IS NULL;

ALTER TABLE "invoice_documents" ALTER COLUMN "kind" SET NOT NULL;

CREATE UNIQUE INDEX "invoice_documents_organization_id_sha256_key"
  ON "invoice_documents"("organization_id", "sha256");
CREATE INDEX "invoice_documents_organization_id_status_created_at_idx"
  ON "invoice_documents"("organization_id", "status", "created_at");

ALTER TABLE "invoice_documents"
  ADD CONSTRAINT "invoice_documents_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_documents_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_documents_imported_by_id_fkey"
  FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
