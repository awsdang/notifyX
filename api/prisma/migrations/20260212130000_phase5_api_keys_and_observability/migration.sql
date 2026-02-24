-- Phase 5: API keys + scoped machine auth
-- Creates app-scoped API keys with rotation/revoke support

CREATE TABLE "api_keys" (
  "id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "org_id" TEXT,
  "name" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_used_at" TIMESTAMP(3),
  "created_by" TEXT,
  "rotated_from_id" TEXT,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "api_keys"
ADD CONSTRAINT "api_keys_app_id_fkey"
FOREIGN KEY ("app_id") REFERENCES "apps"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_keys"
ADD CONSTRAINT "api_keys_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "api_keys_app_id_key_hash_key" ON "api_keys"("app_id", "key_hash");
CREATE INDEX "api_keys_app_id_is_active_idx" ON "api_keys"("app_id", "is_active");
CREATE INDEX "api_keys_org_id_idx" ON "api_keys"("org_id");
CREATE INDEX "api_keys_last_used_at_idx" ON "api_keys"("last_used_at");
