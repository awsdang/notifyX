/*
  Warnings:

  - A unique constraint covering the columns `[token_hash,provider]` on the table `devices` will be added. If there are existing duplicate values, this will fail.
  - Made the column `token_hash` on table `devices` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum (idempotent: skip if value already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SENDING' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CampaignStatus')) THEN
    ALTER TYPE "CampaignStatus" ADD VALUE 'SENDING';
  END IF;
END
$$;

-- Backfill: set empty token_hash for any NULL rows (so NOT NULL won't fail)
UPDATE "devices" SET "token_hash" = md5("push_token" || "provider") WHERE "token_hash" IS NULL;

-- AlterTable
ALTER TABLE "devices" ALTER COLUMN "token_hash" SET NOT NULL;

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "devices_token_hash_provider_key" ON "devices"("token_hash", "provider");
