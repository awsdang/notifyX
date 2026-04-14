-- Base automation workflow tables.
-- Later migrations extend these tables with trigger catalogs and versioning.

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL,
    "trigger_config" JSONB,
    "steps" JSONB NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "automation_id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "resume_at" TIMESTAMP(3),
    "context" JSONB,
    "error_category" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automations_app_id_idx" ON "automations"("app_id");

-- CreateIndex
CREATE INDEX "automations_app_id_trigger_is_active_idx" ON "automations"("app_id", "trigger", "is_active");

-- CreateIndex
CREATE INDEX "automation_executions_automation_id_idx" ON "automation_executions"("automation_id");

-- CreateIndex
CREATE INDEX "automation_executions_status_resume_at_idx" ON "automation_executions"("status", "resume_at");

-- CreateIndex
CREATE INDEX "automation_executions_user_id_idx" ON "automation_executions"("user_id");

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_app_id_fkey"
FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_automation_id_fkey"
FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_device_id_fkey"
FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
