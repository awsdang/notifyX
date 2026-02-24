-- CreateTable
CREATE TABLE "automation_triggers" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "description" TEXT,
    "condition_fields" JSONB,
    "payload_example" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_triggers_app_id_event_name_key" ON "automation_triggers"("app_id", "event_name");

-- CreateIndex
CREATE INDEX "automation_triggers_app_id_is_active_idx" ON "automation_triggers"("app_id", "is_active");

-- AddForeignKey
ALTER TABLE "automation_triggers" ADD CONSTRAINT "automation_triggers_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill triggers from existing automations so legacy workflows continue to validate.
INSERT INTO "automation_triggers" (
    "id",
    "app_id",
    "name",
    "event_name",
    "description",
    "condition_fields",
    "payload_example",
    "is_active",
    "created_by",
    "created_at",
    "updated_at"
)
SELECT
    'atrg_' || substr(md5(a."app_id" || ':' || a."trigger" || ':' || random()::text || clock_timestamp()::text), 1, 24),
    a."app_id",
    a."trigger",
    a."trigger",
    'Backfilled from existing automation trigger',
    NULL,
    NULL,
    true,
    a."created_by",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "app_id", "trigger", "created_by"
    FROM "automations"
    WHERE "trigger" IS NOT NULL AND btrim("trigger") <> ''
) a
ON CONFLICT ("app_id", "event_name") DO NOTHING;

-- Bootstrap at least one trigger for apps with no existing workflows.
INSERT INTO "automation_triggers" (
    "id",
    "app_id",
    "name",
    "event_name",
    "description",
    "condition_fields",
    "payload_example",
    "is_active",
    "created_at",
    "updated_at"
)
SELECT
    'atrg_' || substr(md5(app."id" || ':on_registration:' || random()::text || clock_timestamp()::text), 1, 24),
    app."id",
    'On Registration',
    'On Registration',
    'Fires when a user is registered in NotifyX.',
    '["externalUserId", "userId"]'::jsonb,
    '{"externalUserId": "user_123", "userId": "internal-user-id"}'::jsonb,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "apps" app
WHERE NOT EXISTS (
    SELECT 1
    FROM "automation_triggers" trigger
    WHERE trigger."app_id" = app."id"
)
ON CONFLICT ("app_id", "event_name") DO NOTHING;
