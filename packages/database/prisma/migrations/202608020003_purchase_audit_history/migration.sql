CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_resource_created_at_idx"
ON "audit_logs"("organization_id", "resource", "created_at");
