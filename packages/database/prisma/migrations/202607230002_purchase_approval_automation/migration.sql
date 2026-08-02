-- Purchase workflow, approval rules, durable notifications and payment instructions.
CREATE TYPE "PurchaseWorkflowStage" AS ENUM (
  'REGISTRATION',
  'REQUESTED',
  'AWAITING_APPROVAL',
  'PURCHASE_ORDER',
  'SUPPLIER_INVOICED',
  'RECEIVED',
  'COMPLETED'
);
CREATE TYPE "ApprovalRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);
CREATE TYPE "ApprovalDecisionStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED'
);
CREATE TYPE "PaymentChannel" AS ENUM (
  'PIX',
  'CARD_LINK',
  'BOLETO',
  'BANK_TRANSFER',
  'OTHER'
);
CREATE TYPE "PixKeyType" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM');

ALTER TABLE "users"
  ADD COLUMN "phone" VARCHAR(30);

ALTER TABLE "suppliers"
  ADD COLUMN "pix_key_type" "PixKeyType",
  ADD COLUMN "pix_key" VARCHAR(160),
  ADD COLUMN "payment_link" VARCHAR(500),
  ADD CONSTRAINT "suppliers_pix_key_pair_check"
    CHECK (
      ("pix_key_type" IS NULL AND "pix_key" IS NULL)
      OR ("pix_key_type" IS NOT NULL AND "pix_key" IS NOT NULL)
    ),
  ADD CONSTRAINT "suppliers_payment_link_https_check"
    CHECK (
      "payment_link" IS NULL
      OR "payment_link" ~* '^https://[^[:space:]]+$'
    );

ALTER TABLE "purchases"
  ADD COLUMN "workflow_stage" "PurchaseWorkflowStage";

UPDATE "purchases"
SET "workflow_stage" = CASE
  WHEN "status" = 'DRAFT' THEN 'REGISTRATION'::"PurchaseWorkflowStage"
  WHEN "invoice_number" IS NOT NULL THEN 'COMPLETED'::"PurchaseWorkflowStage"
  ELSE 'PURCHASE_ORDER'::"PurchaseWorkflowStage"
END;

ALTER TABLE "purchases"
  ALTER COLUMN "workflow_stage" SET NOT NULL,
  ALTER COLUMN "workflow_stage" SET DEFAULT 'REGISTRATION',
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ADD CONSTRAINT "purchases_workflow_status_check"
    CHECK (
      "status" = 'CANCELLED'
      OR (
        "status" = 'DRAFT'
        AND "workflow_stage" IN (
          'REGISTRATION'::"PurchaseWorkflowStage",
          'REQUESTED'::"PurchaseWorkflowStage",
          'AWAITING_APPROVAL'::"PurchaseWorkflowStage"
        )
      )
      OR (
        "status" = 'REGISTERED'
        AND "workflow_stage" IN (
          'PURCHASE_ORDER'::"PurchaseWorkflowStage",
          'SUPPLIER_INVOICED'::"PurchaseWorkflowStage",
          'RECEIVED'::"PurchaseWorkflowStage",
          'COMPLETED'::"PurchaseWorkflowStage"
        )
      )
    );

ALTER TABLE "installments"
  ADD COLUMN "payment_channel" "PaymentChannel",
  ADD COLUMN "payment_reference" VARCHAR(500),
  ADD COLUMN "payment_notes" VARCHAR(500);

CREATE TABLE "approval_settings" (
  "organization_id" UUID NOT NULL,
  "finance_channel" "NotificationChannel",
  "finance_recipient" VARCHAR(255),
  "notify_finance_on_approval" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "approval_settings_finance_destination_check"
    CHECK (
      ("finance_channel" IS NULL AND "finance_recipient" IS NULL)
      OR ("finance_channel" IS NOT NULL AND "finance_recipient" IS NOT NULL)
    ),
  CONSTRAINT "approval_settings_notification_enabled_check"
    CHECK (
      NOT "notify_finance_on_approval"
      OR "finance_channel" IS NOT NULL
    )
);

CREATE TABLE "approval_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "minimum_amount" DECIMAL(14,2) NOT NULL,
  "required_approvals" INTEGER NOT NULL,
  "notification_channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_rules_minimum_amount_check" CHECK ("minimum_amount" >= 0),
  CONSTRAINT "approval_rules_required_approvals_check"
    CHECK ("required_approvals" BETWEEN 1 AND 2)
);

CREATE TABLE "approval_rule_approvers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_rule_approvers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_approval_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "rule_id" UUID NOT NULL,
  "submitted_by_id" UUID NOT NULL,
  "rule_name_snapshot" VARCHAR(120) NOT NULL,
  "notification_channel" "NotificationChannel" NOT NULL,
  "amount_snapshot" DECIMAL(14,2) NOT NULL,
  "required_approvals" INTEGER NOT NULL,
  "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "purchase_approval_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_approval_requests_required_approvals_check"
    CHECK ("required_approvals" BETWEEN 1 AND 2),
  CONSTRAINT "purchase_approval_requests_resolution_check"
    CHECK (
      ("status" = 'PENDING' AND "resolved_at" IS NULL)
      OR ("status" <> 'PENDING' AND "resolved_at" IS NOT NULL)
    )
);

CREATE TABLE "purchase_approval_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name_snapshot" VARCHAR(120) NOT NULL,
  "recipient_snapshot" VARCHAR(255) NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "decision" "ApprovalDecisionStatus" NOT NULL DEFAULT 'PENDING',
  "comment" VARCHAR(500),
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_approval_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_approval_participants_decision_time_check"
    CHECK (
      ("decision" = 'PENDING' AND "decided_at" IS NULL)
      OR ("decision" <> 'PENDING' AND "decided_at" IS NOT NULL)
    ),
  CONSTRAINT "purchase_approval_participants_rejection_comment_check"
    CHECK (
      "decision" <> 'REJECTED'
      OR (
        "comment" IS NOT NULL
        AND LENGTH(BTRIM("comment")) >= 3
      )
    )
);

CREATE TABLE "purchase_stage_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "from_stage" "PurchaseWorkflowStage",
  "to_stage" "PurchaseWorkflowStage" NOT NULL,
  "changed_by_id" UUID NOT NULL,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_stage_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_outbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "deduplication_key" VARCHAR(220) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "recipient" VARCHAR(255) NOT NULL,
  "subject" VARCHAR(200),
  "payload" JSONB NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  "last_error" VARCHAR(1000),
  "provider_message_id" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_outbox_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "notification_outbox_delivery_check"
    CHECK (
      ("status" = 'SENT' AND "sent_at" IS NOT NULL)
      OR ("status" <> 'SENT' AND "sent_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "approval_rules_organization_id_minimum_amount_key"
  ON "approval_rules"("organization_id", "minimum_amount");
CREATE UNIQUE INDEX "approval_rules_organization_id_id_key"
  ON "approval_rules"("organization_id", "id");
CREATE INDEX "approval_rules_organization_id_active_minimum_amount_idx"
  ON "approval_rules"("organization_id", "active", "minimum_amount");

CREATE UNIQUE INDEX "approval_rule_approvers_organization_id_rule_id_user_id_key"
  ON "approval_rule_approvers"("organization_id", "rule_id", "user_id");
CREATE INDEX "approval_rule_approvers_organization_id_user_id_idx"
  ON "approval_rule_approvers"("organization_id", "user_id");

CREATE UNIQUE INDEX "purchase_approval_requests_organization_id_id_key"
  ON "purchase_approval_requests"("organization_id", "id");
CREATE INDEX "purchase_approval_requests_organization_id_purchase_id_status_idx"
  ON "purchase_approval_requests"("organization_id", "purchase_id", "status");
CREATE INDEX "purchase_approval_requests_organization_id_submitted_at_idx"
  ON "purchase_approval_requests"("organization_id", "submitted_at");
CREATE UNIQUE INDEX "purchase_approval_requests_one_pending_per_purchase_key"
  ON "purchase_approval_requests"("organization_id", "purchase_id")
  WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "purchase_approval_participants_organization_id_request_id_user_id_key"
  ON "purchase_approval_participants"("organization_id", "request_id", "user_id");
CREATE INDEX "purchase_approval_participants_organization_id_user_id_decision_idx"
  ON "purchase_approval_participants"("organization_id", "user_id", "decision");

CREATE INDEX "purchase_stage_history_organization_id_purchase_id_created_at_idx"
  ON "purchase_stage_history"("organization_id", "purchase_id", "created_at");
CREATE INDEX "purchases_organization_id_workflow_stage_updated_at_idx"
  ON "purchases"("organization_id", "workflow_stage", "updated_at");

CREATE UNIQUE INDEX "notification_outbox_organization_id_deduplication_key_key"
  ON "notification_outbox"("organization_id", "deduplication_key");
CREATE INDEX "notification_outbox_status_available_at_idx"
  ON "notification_outbox"("status", "available_at");
CREATE INDEX "notification_outbox_organization_id_created_at_idx"
  ON "notification_outbox"("organization_id", "created_at");

ALTER TABLE "approval_settings"
  ADD CONSTRAINT "approval_settings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_rules"
  ADD CONSTRAINT "approval_rules_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_rule_approvers"
  ADD CONSTRAINT "approval_rule_approvers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "approval_rule_approvers_organization_id_rule_id_fkey"
    FOREIGN KEY ("organization_id", "rule_id")
    REFERENCES "approval_rules"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "approval_rule_approvers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_approval_requests"
  ADD CONSTRAINT "purchase_approval_requests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_approval_requests_organization_id_purchase_id_fkey"
    FOREIGN KEY ("organization_id", "purchase_id")
    REFERENCES "purchases"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_approval_requests_organization_id_rule_id_fkey"
    FOREIGN KEY ("organization_id", "rule_id")
    REFERENCES "approval_rules"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_approval_requests_submitted_by_id_fkey"
    FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_approval_participants"
  ADD CONSTRAINT "purchase_approval_participants_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_approval_participants_organization_id_request_id_fkey"
    FOREIGN KEY ("organization_id", "request_id")
    REFERENCES "purchase_approval_requests"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_approval_participants_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_stage_history"
  ADD CONSTRAINT "purchase_stage_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_stage_history_organization_id_purchase_id_fkey"
    FOREIGN KEY ("organization_id", "purchase_id")
    REFERENCES "purchases"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_stage_history_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_rule_approvers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_approval_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_approval_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_stage_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "approval_settings" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "approval_rules" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "approval_rule_approvers" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "purchase_approval_requests" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "purchase_approval_participants" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "purchase_stage_history" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "notification_outbox" FROM PUBLIC, anon, authenticated;
