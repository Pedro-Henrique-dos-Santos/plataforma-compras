UPDATE "supplier_prices"
SET "source" = 'MANUAL'
WHERE "source" IS NULL;

ALTER TABLE "supplier_prices"
  ALTER COLUMN "source" SET DEFAULT 'MANUAL',
  ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "purchases"
  ADD COLUMN "source" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "source_reference" VARCHAR(120);

CREATE UNIQUE INDEX "supplier_prices_organization_id_supplier_id_item_code_key"
  ON "supplier_prices"("organization_id", "supplier_id", "item_code");

CREATE UNIQUE INDEX "purchases_organization_id_source_source_reference_key"
  ON "purchases"("organization_id", "source", "source_reference");
