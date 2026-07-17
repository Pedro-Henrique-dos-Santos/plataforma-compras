ALTER TABLE "users"
  ADD COLUMN "terms_accepted_at" TIMESTAMP(3),
  ADD COLUMN "terms_version" VARCHAR(40),
  ADD COLUMN "privacy_accepted_at" TIMESTAMP(3),
  ADD COLUMN "privacy_version" VARCHAR(40);

ALTER TABLE "organizations"
  ADD COLUMN "legal_name" VARCHAR(160),
  ADD COLUMN "email" VARCHAR(255),
  ADD COLUMN "phone" VARCHAR(30),
  ADD COLUMN "postal_code" VARCHAR(8),
  ADD COLUMN "street" VARCHAR(160),
  ADD COLUMN "address_number" VARCHAR(30),
  ADD COLUMN "address_complement" VARCHAR(100),
  ADD COLUMN "district" VARCHAR(100),
  ADD COLUMN "city" VARCHAR(100),
  ADD COLUMN "state" CHAR(2);

ALTER TABLE "purchases"
  ALTER COLUMN "issued_at" DROP NOT NULL;
