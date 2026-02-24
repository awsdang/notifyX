-- Phase 4: Security Fixes
-- 1. Add token_hash column to devices (for secure lookups)
-- 2. Replace push_token unique constraint with token_hash
-- 3. Create suppressions table

-- Step 1: Add token_hash column (nullable initially for backfill)
ALTER TABLE "devices" ADD COLUMN "token_hash" TEXT;

-- Step 2: Drop the old unique constraint on (push_token, provider)
DROP INDEX IF EXISTS "devices_push_token_provider_key";

-- NOTE: After this migration, run the data backfill script:
--   bun scripts/backfill-token-hashes.ts
-- That script populates token_hash for all existing devices and encrypts push_token.

-- Step 3: After backfill, make token_hash NOT NULL and add new unique constraint.
-- These are in a separate DO block so they can be run after backfill.
-- If running manually, ensure backfill has completed first.

-- For automated migrations (Prisma), we set a temporary default and then
-- the backfill script will overwrite it. After backfill, the NOT NULL is safe.
-- Prisma expects NOT NULL + unique already in schema, so we must handle this.
-- We use a generated column approach: temporarily allow nulls, backfill, then enforce.

-- Step 3a: Create the unique index on (token_hash, provider)
-- Uses a partial index that only covers non-null token_hash, so it's safe before backfill
CREATE UNIQUE INDEX "devices_token_hash_provider_key" ON "devices"("token_hash", "provider")
  WHERE "token_hash" IS NOT NULL;

-- Step 4: Create suppressions table
CREATE TABLE "suppressions" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "user_id" TEXT,
    "device_id" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressions_pkey" PRIMARY KEY ("id")
);

-- Indexes for suppressions
CREATE INDEX "suppressions_app_id_user_id_idx" ON "suppressions"("app_id", "user_id");
CREATE INDEX "suppressions_app_id_device_id_idx" ON "suppressions"("app_id", "device_id");
CREATE INDEX "suppressions_expires_at_idx" ON "suppressions"("expires_at");
