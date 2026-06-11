-- Persist "favourite test users" per app on the user row.
ALTER TABLE "users"
ADD COLUMN "is_test_user" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "users_app_id_is_test_user_idx"
ON "users"("app_id", "is_test_user");
