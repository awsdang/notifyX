-- Fix devices token hash uniqueness for Prisma upsert ON CONFLICT
-- Ensures a non-partial unique index exists on (token_hash, provider).

-- 1) Backfill any null token hashes (legacy rows)
UPDATE "devices"
SET "token_hash" = md5("push_token" || "provider")
WHERE "token_hash" IS NULL;

-- 2) Deduplicate by (token_hash, provider), keeping most recently updated row
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "token_hash", "provider"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS rn
  FROM "devices"
)
DELETE FROM "devices" d
USING ranked r
WHERE d."id" = r."id"
  AND r.rn > 1;

-- 3) Replace any partial/incorrect unique index with a full unique index
DROP INDEX IF EXISTS "devices_token_hash_provider_key";

-- 4) Enforce non-null + full uniqueness for ON CONFLICT(token_hash, provider)
ALTER TABLE "devices"
ALTER COLUMN "token_hash" SET NOT NULL;

CREATE UNIQUE INDEX "devices_token_hash_provider_key"
ON "devices"("token_hash", "provider");
