-- The browser uses Supabase only for authentication. Application data must pass
-- through the NestJS API, which applies tenant and permission checks.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_centers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "installments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Supabase creates these roles. The conditional blocks keep the migration
-- compatible with a plain PostgreSQL development database.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
  END IF;
END
$$;
