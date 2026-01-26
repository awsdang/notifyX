/*
  Warnings:

  - You are about to drop the `app_credentials` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('UAT', 'PROD');

-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('AUTH', 'TOKEN_INVALID', 'RATE_LIMIT', 'PAYLOAD_TOO_LARGE', 'PROVIDER_OUTAGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CSV_AUDIENCE', 'IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "CredentialTestStatus" AS ENUM ('SUCCESS', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "CampaignStatus" ADD VALUE 'APPROVED';

-- DropForeignKey
ALTER TABLE "app_credentials" DROP CONSTRAINT "app_credentials_app_id_fkey";

-- AlterTable
ALTER TABLE "apps" ADD COLUMN     "bundle_id" TEXT,
ADD COLUMN     "org_id" TEXT,
ADD COLUMN     "package_name" TEXT;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "audience_asset_id" TEXT,
ADD COLUMN     "audience_hash" TEXT,
ADD COLUMN     "audience_source_type" TEXT,
ADD COLUMN     "estimated_reach" INTEGER;

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "deactivated_by" TEXT,
ADD COLUMN     "deactivation_note" TEXT,
ADD COLUMN     "deactivation_reason" TEXT;

-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "failure_category" TEXT,
ADD COLUMN     "provider_reason" TEXT;

-- DropTable
DROP TABLE "app_credentials";

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_members" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "app_environments" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "env" "Environment" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_policies" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "allow_csv" BOOLEAN NOT NULL DEFAULT true,
    "allow_segments" BOOLEAN NOT NULL DEFAULT true,
    "allow_high_priority_campaigns" BOOLEAN NOT NULL DEFAULT true,
    "csv_max_size_bytes" INTEGER NOT NULL DEFAULT 5242880,
    "image_max_size_bytes" INTEGER NOT NULL DEFAULT 2097152,

    CONSTRAINT "app_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "app_environment_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_versions" (
    "id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "encrypted_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "credential_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_test_runs" (
    "id" TEXT NOT NULL,
    "credential_version_id" TEXT NOT NULL,
    "status" "CredentialTestStatus" NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "provider_response" JSONB,
    "tested_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "app_environment_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "events_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "org_id" TEXT,
    "app_id" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_approvals" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaign_snapshot_hash" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "campaign_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "org_members_org_id_idx" ON "org_members"("org_id");

-- CreateIndex
CREATE INDEX "org_members_admin_user_id_idx" ON "org_members"("admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_org_id_admin_user_id_key" ON "org_members"("org_id", "admin_user_id");

-- CreateIndex
CREATE INDEX "roles_org_id_idx" ON "roles"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_org_id_name_key" ON "roles"("org_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "app_environments_app_id_idx" ON "app_environments"("app_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_environments_app_id_env_key" ON "app_environments"("app_id", "env");

-- CreateIndex
CREATE UNIQUE INDEX "app_policies_app_id_key" ON "app_policies"("app_id");

-- CreateIndex
CREATE INDEX "credentials_app_environment_id_idx" ON "credentials"("app_environment_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_app_environment_id_provider_key" ON "credentials"("app_environment_id", "provider");

-- CreateIndex
CREATE INDEX "credential_versions_credential_id_idx" ON "credential_versions"("credential_id");

-- CreateIndex
CREATE INDEX "credential_versions_is_active_idx" ON "credential_versions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "credential_versions_credential_id_version_key" ON "credential_versions"("credential_id", "version");

-- CreateIndex
CREATE INDEX "credential_test_runs_credential_version_id_idx" ON "credential_test_runs"("credential_version_id");

-- CreateIndex
CREATE INDEX "webhook_endpoints_app_environment_id_idx" ON "webhook_endpoints"("app_environment_id");

-- CreateIndex
CREATE INDEX "assets_app_id_idx" ON "assets"("app_id");

-- CreateIndex
CREATE INDEX "assets_org_id_idx" ON "assets"("org_id");

-- CreateIndex
CREATE INDEX "campaign_approvals_campaign_id_idx" ON "campaign_approvals"("campaign_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_app_id_key_key" ON "idempotency_keys"("app_id", "key");

-- CreateIndex
CREATE INDEX "apps_org_id_idx" ON "apps"("org_id");

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_environments" ADD CONSTRAINT "app_environments_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_policies" ADD CONSTRAINT "app_policies_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_app_environment_id_fkey" FOREIGN KEY ("app_environment_id") REFERENCES "app_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_versions" ADD CONSTRAINT "credential_versions_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_test_runs" ADD CONSTRAINT "credential_test_runs_credential_version_id_fkey" FOREIGN KEY ("credential_version_id") REFERENCES "credential_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_app_environment_id_fkey" FOREIGN KEY ("app_environment_id") REFERENCES "app_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_approvals" ADD CONSTRAINT "campaign_approvals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
