ALTER TABLE "purchases"
  ADD COLUMN "display_sequence" INTEGER;

WITH ranked_purchases AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organization_id"
      ORDER BY "issued_at" ASC NULLS LAST, "created_at" ASC, "id" ASC
    )::INTEGER AS "display_sequence"
  FROM "purchases"
)
UPDATE "purchases" AS purchase
SET "display_sequence" = ranked."display_sequence"
FROM ranked_purchases AS ranked
WHERE purchase."id" = ranked."id";

ALTER TABLE "purchases"
  ALTER COLUMN "display_sequence" SET NOT NULL;

CREATE UNIQUE INDEX "purchases_organization_id_display_sequence_key"
  ON "purchases"("organization_id", "display_sequence");
