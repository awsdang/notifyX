-- Supports the device-health sweep's candidate query:
--   WHERE is_active = true AND token_invalid_at IS NULL AND last_seen_at < $1
--   ORDER BY id
--
-- CONCURRENTLY so the build does not take a write lock on `devices`. Note this
-- cannot run inside a transaction, so apply it with `prisma db execute` rather
-- than `prisma migrate deploy` if your migration runner wraps statements.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "devices_is_active_token_invalid_at_last_seen_at_idx"
  ON "devices" ("is_active", "token_invalid_at", "last_seen_at");
