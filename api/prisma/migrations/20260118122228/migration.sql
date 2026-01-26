-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'APP_MANAGER', 'MARKETING_MANAGER');

-- CreateEnum
CREATE TYPE "ABTestStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platforms" JSONB NOT NULL,
    "default_language" TEXT NOT NULL,
    "is_killed" BOOLEAN NOT NULL DEFAULT false,
    "webhook_url" TEXT,
    "webhook_secret" TEXT,
    "webhook_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_credentials" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token_expires_at" TIMESTAMP(3),
    "token_invalid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT NOT NULL,
    "image" TEXT,
    "variables" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "template_id" TEXT,
    "variant_id" TEXT,
    "campaign_id" TEXT,
    "payload" JSONB,
    "send_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "created_by" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "error_code" TEXT,
    "sent_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retry_jobs" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "next_attempt_at" TIMESTAMP(3) NOT NULL,
    "attempt" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retry_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_queue" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT,
    "delivery_id" TEXT,
    "provider" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error_message" TEXT NOT NULL,
    "error_code" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "dead_letter_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'MARKETING_MANAGER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_managers" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" TEXT,
    "ip_address" TEXT,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "app_id" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_tests" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ABTestStatus" NOT NULL DEFAULT 'DRAFT',
    "targeting_mode" TEXT NOT NULL DEFAULT 'ALL',
    "target_user_ids" JSONB,
    "csv_file_url" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_test_variants" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT NOT NULL,
    "image" TEXT,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_test_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_test_assignments" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_test_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "targeting_mode" TEXT NOT NULL DEFAULT 'ALL',
    "target_user_ids" JSONB,
    "csv_file_url" TEXT,
    "total_targets" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT NOT NULL,
    "image" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_credentials_app_id_idx" ON "app_credentials"("app_id");

-- CreateIndex
CREATE INDEX "app_credentials_provider_is_active_idx" ON "app_credentials"("provider", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "app_credentials_app_id_provider_key" ON "app_credentials"("app_id", "provider");

-- CreateIndex
CREATE INDEX "users_app_id_idx" ON "users"("app_id");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_app_id_external_user_id_key" ON "users"("app_id", "external_user_id");

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "devices_is_active_idx" ON "devices"("is_active");

-- CreateIndex
CREATE INDEX "devices_provider_is_active_idx" ON "devices"("provider", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "devices_push_token_provider_key" ON "devices"("push_token", "provider");

-- CreateIndex
CREATE INDEX "notifications_send_at_status_idx" ON "notifications"("send_at", "status");

-- CreateIndex
CREATE INDEX "notifications_app_id_status_idx" ON "notifications"("app_id", "status");

-- CreateIndex
CREATE INDEX "notifications_app_id_createdAt_idx" ON "notifications"("app_id", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_status_priority_idx" ON "notifications"("status", "priority");

-- CreateIndex
CREATE INDEX "notifications_campaign_id_idx" ON "notifications"("campaign_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_device_id_idx" ON "notification_deliveries"("device_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries"("status");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_createdAt_idx" ON "notification_deliveries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_provider_status_idx" ON "notification_deliveries"("provider", "status");

-- CreateIndex
CREATE INDEX "retry_jobs_next_attempt_at_idx" ON "retry_jobs"("next_attempt_at");

-- CreateIndex
CREATE INDEX "retry_jobs_delivery_id_idx" ON "retry_jobs"("delivery_id");

-- CreateIndex
CREATE INDEX "dead_letter_queue_created_at_idx" ON "dead_letter_queue"("created_at");

-- CreateIndex
CREATE INDEX "dead_letter_queue_processed_at_idx" ON "dead_letter_queue"("processed_at");

-- CreateIndex
CREATE INDEX "dead_letter_queue_provider_idx" ON "dead_letter_queue"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_email_idx" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_is_active_idx" ON "admin_users"("role", "is_active");

-- CreateIndex
CREATE INDEX "app_managers_admin_user_id_idx" ON "app_managers"("admin_user_id");

-- CreateIndex
CREATE INDEX "app_managers_app_id_idx" ON "app_managers"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_managers_admin_user_id_app_id_key" ON "app_managers"("admin_user_id", "app_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_key" ON "admin_sessions"("token");

-- CreateIndex
CREATE INDEX "admin_sessions_token_idx" ON "admin_sessions"("token");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_admin_user_id_created_at_idx" ON "audit_logs"("admin_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_app_id_created_at_idx" ON "audit_logs"("app_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "ab_tests_app_id_status_idx" ON "ab_tests"("app_id", "status");

-- CreateIndex
CREATE INDEX "ab_tests_status_scheduled_at_idx" ON "ab_tests"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "ab_test_variants_test_id_idx" ON "ab_test_variants"("test_id");

-- CreateIndex
CREATE INDEX "ab_test_assignments_test_id_idx" ON "ab_test_assignments"("test_id");

-- CreateIndex
CREATE INDEX "ab_test_assignments_user_id_idx" ON "ab_test_assignments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ab_test_assignments_test_id_user_id_key" ON "ab_test_assignments"("test_id", "user_id");

-- CreateIndex
CREATE INDEX "campaigns_app_id_status_idx" ON "campaigns"("app_id", "status");

-- CreateIndex
CREATE INDEX "campaigns_status_scheduled_at_idx" ON "campaigns"("status", "scheduled_at");

-- AddForeignKey
ALTER TABLE "app_credentials" ADD CONSTRAINT "app_credentials_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ab_test_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retry_jobs" ADD CONSTRAINT "retry_jobs_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "notification_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_managers" ADD CONSTRAINT "app_managers_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_managers" ADD CONSTRAINT "app_managers_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_variants" ADD CONSTRAINT "ab_test_variants_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_assignments" ADD CONSTRAINT "ab_test_assignments_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_assignments" ADD CONSTRAINT "ab_test_assignments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ab_test_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
