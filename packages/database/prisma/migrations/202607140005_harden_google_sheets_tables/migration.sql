-- Google Sheets tables were introduced after the original database hardening
-- migration. Keep direct browser roles blocked for every operational table.
ALTER TABLE "google_sheets_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sheet_sync_runs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "google_sheets_integrations" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "sheet_sync_runs" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "google_sheets_integrations", "sheet_sync_runs" FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "google_sheets_integrations", "sheet_sync_runs" FROM authenticated';
  END IF;
END
$$;
