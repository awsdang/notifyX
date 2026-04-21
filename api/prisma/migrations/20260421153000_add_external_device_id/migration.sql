ALTER TABLE "devices"
ADD COLUMN "external_device_id" TEXT;

CREATE INDEX "devices_external_device_id_idx"
ON "devices"("external_device_id");
