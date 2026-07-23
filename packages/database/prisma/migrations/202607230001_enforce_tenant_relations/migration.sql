-- Reject cross-company references even when a write bypasses the API repositories.
CREATE UNIQUE INDEX "cost_centers_organization_id_id_key"
  ON "cost_centers"("organization_id", "id");
CREATE UNIQUE INDEX "suppliers_organization_id_id_key"
  ON "suppliers"("organization_id", "id");
CREATE UNIQUE INDEX "purchases_organization_id_id_key"
  ON "purchases"("organization_id", "id");
CREATE UNIQUE INDEX "google_sheets_integrations_organization_id_id_key"
  ON "google_sheets_integrations"("organization_id", "id");
CREATE UNIQUE INDEX "purchase_items_organization_id_id_key"
  ON "purchase_items"("organization_id", "id");

ALTER TABLE "suppliers"
  DROP CONSTRAINT "suppliers_default_cost_center_id_fkey",
  ADD CONSTRAINT "suppliers_organization_id_default_cost_center_id_fkey"
    FOREIGN KEY ("organization_id", "default_cost_center_id")
    REFERENCES "cost_centers"("organization_id", "id")
    ON DELETE SET NULL ("default_cost_center_id") ON UPDATE CASCADE;

ALTER TABLE "supplier_prices"
  DROP CONSTRAINT "supplier_prices_supplier_id_fkey",
  ADD CONSTRAINT "supplier_prices_organization_id_supplier_id_fkey"
    FOREIGN KEY ("organization_id", "supplier_id")
    REFERENCES "suppliers"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchases"
  DROP CONSTRAINT "purchases_supplier_id_fkey",
  ADD CONSTRAINT "purchases_organization_id_supplier_id_fkey"
    FOREIGN KEY ("organization_id", "supplier_id")
    REFERENCES "suppliers"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sheet_sync_runs"
  DROP CONSTRAINT "sheet_sync_runs_integration_id_fkey",
  ADD CONSTRAINT "sheet_sync_runs_organization_id_integration_id_fkey"
    FOREIGN KEY ("organization_id", "integration_id")
    REFERENCES "google_sheets_integrations"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_items"
  DROP CONSTRAINT "purchase_items_purchase_id_fkey",
  DROP CONSTRAINT "purchase_items_cost_center_id_fkey",
  ADD CONSTRAINT "purchase_items_organization_id_purchase_id_fkey"
    FOREIGN KEY ("organization_id", "purchase_id")
    REFERENCES "purchases"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_items_organization_id_cost_center_id_fkey"
    FOREIGN KEY ("organization_id", "cost_center_id")
    REFERENCES "cost_centers"("organization_id", "id")
    ON DELETE SET NULL ("cost_center_id") ON UPDATE CASCADE;

ALTER TABLE "cost_allocations"
  DROP CONSTRAINT "cost_allocations_purchase_item_id_fkey",
  DROP CONSTRAINT "cost_allocations_cost_center_id_fkey",
  ADD CONSTRAINT "cost_allocations_organization_id_purchase_item_id_fkey"
    FOREIGN KEY ("organization_id", "purchase_item_id")
    REFERENCES "purchase_items"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "cost_allocations_organization_id_cost_center_id_fkey"
    FOREIGN KEY ("organization_id", "cost_center_id")
    REFERENCES "cost_centers"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "installments"
  DROP CONSTRAINT "installments_purchase_id_fkey",
  ADD CONSTRAINT "installments_organization_id_purchase_id_fkey"
    FOREIGN KEY ("organization_id", "purchase_id")
    REFERENCES "purchases"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_documents"
  DROP CONSTRAINT "invoice_documents_purchase_id_fkey",
  ADD CONSTRAINT "invoice_documents_organization_id_purchase_id_fkey"
    FOREIGN KEY ("organization_id", "purchase_id")
    REFERENCES "purchases"("organization_id", "id")
    ON DELETE SET NULL ("purchase_id") ON UPDATE CASCADE;
