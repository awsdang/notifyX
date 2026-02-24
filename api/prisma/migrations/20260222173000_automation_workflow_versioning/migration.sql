-- Trigger schema metadata
ALTER TABLE "automation_triggers"
ADD COLUMN "condition_schema" JSONB;

-- Draft/published workflow metadata
ALTER TABLE "automations"
ADD COLUMN "draft_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "published_version" INTEGER,
ADD COLUMN "published_trigger" TEXT,
ADD COLUMN "published_at" TIMESTAMP(3);

-- Immutable published workflow snapshots
CREATE TABLE "automation_versions" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" TEXT NOT NULL,
    "trigger_config" JSONB,
    "steps" JSONB NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_versions_automation_id_version_key"
ON "automation_versions"("automation_id", "version");

CREATE INDEX "automation_versions_automation_id_published_at_idx"
ON "automation_versions"("automation_id", "published_at");

CREATE INDEX "automations_app_id_published_trigger_is_active_idx"
ON "automations"("app_id", "published_trigger", "is_active");

ALTER TABLE "automation_versions"
ADD CONSTRAINT "automation_versions_automation_id_fkey"
FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill currently active workflows as published version 1 snapshots.
INSERT INTO "automation_versions" (
    "id",
    "automation_id",
    "version",
    "name",
    "description",
    "trigger",
    "trigger_config",
    "steps",
    "created_by",
    "created_at",
    "published_at"
)
SELECT
    'aver_' || substr(md5(a."id" || ':v1:' || random()::text || clock_timestamp()::text), 1, 24),
    a."id",
    1,
    a."name",
    a."description",
    a."trigger",
    a."trigger_config",
    a."steps",
    a."created_by",
    COALESCE(a."updated_at", a."created_at"),
    COALESCE(a."updated_at", a."created_at")
FROM "automations" a
WHERE a."is_active" = true;

UPDATE "automations"
SET
    "published_version" = 1,
    "published_trigger" = "trigger",
    "published_at" = COALESCE("updated_at", "created_at")
WHERE "is_active" = true;
