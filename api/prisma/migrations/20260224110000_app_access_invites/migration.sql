-- CreateEnum
CREATE TYPE "AppAccessInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "app_access_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'MARKETING_MANAGER',
    "app_id" TEXT NOT NULL,
    "invited_by_admin_user_id" TEXT,
    "accepted_by_admin_user_id" TEXT,
    "status" "AppAccessInviteStatus" NOT NULL DEFAULT 'PENDING',
    "accepted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_access_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_access_invites_app_id_email_key" ON "app_access_invites"("app_id", "email");

-- CreateIndex
CREATE INDEX "app_access_invites_email_status_idx" ON "app_access_invites"("email", "status");

-- CreateIndex
CREATE INDEX "app_access_invites_app_id_status_idx" ON "app_access_invites"("app_id", "status");

-- AddForeignKey
ALTER TABLE "app_access_invites" ADD CONSTRAINT "app_access_invites_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_access_invites" ADD CONSTRAINT "app_access_invites_invited_by_admin_user_id_fkey" FOREIGN KEY ("invited_by_admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_access_invites" ADD CONSTRAINT "app_access_invites_accepted_by_admin_user_id_fkey" FOREIGN KEY ("accepted_by_admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
