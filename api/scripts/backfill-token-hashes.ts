/**
 * Backfill Token Hashes & Encrypt Push Tokens
 *
 * Run AFTER the phase4_security_fixes migration:
 *   bun scripts/backfill-token-hashes.ts
 *
 * What it does:
 *   1. Reads all devices that have token_hash = NULL (not yet migrated)
 *   2. For each device:
 *      a. Computes SHA-256 hash of the raw push_token → token_hash
 *      b. Encrypts the raw push_token using AES-256-GCM → encrypted push_token
 *   3. Updates the device record with both values
 *   4. After all devices are backfilled, makes token_hash NOT NULL
 *   5. Replaces the partial unique index with a full unique constraint
 *
 * IMPORTANT:
 *   - Requires CREDENTIAL_ENCRYPTION_KEY (≥32 chars) in env
 *   - This script is idempotent: re-running it only processes un-migrated devices
 *   - Processes in batches of 500 to avoid memory issues
 *   - Uses a transaction per batch for atomicity
 */

import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

// Import crypto utils (same as application uses)
// We inline the functions here to keep the script self-contained
// and avoid import issues with the build system.

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.error(
    "❌ CREDENTIAL_ENCRYPTION_KEY is required (min 32 chars).\n" +
      "   Generate one with: openssl rand -base64 48",
  );
  process.exit(1);
}

const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function encryptToken(token: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY!, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
  });

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const packed = Buffer.concat([salt, iv, authTag, encrypted]);
  const payload = {
    iv: iv.toString("hex"),
    encryptedData: packed.toString("hex"),
  };
  return JSON.stringify(payload);
}

// ---

const BATCH_SIZE = 500;
const prisma = new PrismaClient();

async function main() {
  console.log("🔐 Starting push token backfill...\n");

  // Count un-migrated devices
  const totalCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM devices WHERE token_hash IS NULL
  `;
  const total = Number(totalCount[0].count);

  if (total === 0) {
    console.log(
      "✅ No devices need migration. All token_hash values are populated.",
    );
    await finalize();
    return;
  }

  console.log(`📊 Found ${total} devices to migrate\n`);

  let processed = 0;
  let duplicatesSkipped = 0;

  // Track hashes to detect duplicates within this run
  const seenHashes = new Map<string, string>(); // hash:provider → deviceId

  while (true) {
    // Fetch a batch of un-migrated devices
    const devices = await prisma.$queryRaw<
      { id: string; push_token: string; provider: string }[]
    >`
      SELECT id, push_token, provider FROM devices
      WHERE token_hash IS NULL
      ORDER BY created_at ASC
      LIMIT ${BATCH_SIZE}
    `;

    if (devices.length === 0) break;

    const updates: { id: string; tokenHash: string; encryptedToken: string }[] =
      [];

    for (const device of devices) {
      const hash = hashToken(device.push_token);
      const compositeKey = `${hash}:${device.provider}`;

      // Check for duplicate tokens (same token+provider = same device registered twice)
      if (seenHashes.has(compositeKey)) {
        console.warn(
          `  ⚠ Duplicate token for device ${device.id} (same as ${seenHashes.get(compositeKey)}), deactivating...`,
        );
        duplicatesSkipped++;
        // Deactivate the duplicate — keep the earlier one
        await prisma.$executeRaw`
          UPDATE devices SET is_active = false, token_hash = ${hash + ":dup:" + device.id},
            deactivation_reason = 'DUPLICATE_TOKEN_MIGRATION'
          WHERE id = ${device.id}
        `;
        continue;
      }

      seenHashes.set(compositeKey, device.id);
      const encrypted = encryptToken(device.push_token);
      updates.push({
        id: device.id,
        tokenHash: hash,
        encryptedToken: encrypted,
      });
    }

    // Batch update in a transaction
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map(
          (u) =>
            prisma.$executeRaw`
            UPDATE devices
            SET token_hash = ${u.tokenHash},
                push_token = ${u.encryptedToken}
            WHERE id = ${u.id}
          `,
        ),
      );
    }

    processed += devices.length;
    const pct = Math.round((processed / total) * 100);
    process.stdout.write(`\r  Progress: ${processed}/${total} (${pct}%)`);
  }

  console.log(
    `\n\n✅ Backfill complete: ${processed} devices processed, ${duplicatesSkipped} duplicates deactivated`,
  );

  await finalize();
}

/**
 * After backfill: make token_hash NOT NULL and upgrade the unique index.
 */
async function finalize() {
  console.log("\n🔒 Finalizing schema constraints...");

  // Check if any NULLs remain (excluding deactivated dups which got a placeholder hash)
  const remaining = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM devices WHERE token_hash IS NULL
  `;

  if (Number(remaining[0].count) > 0) {
    console.error(
      `❌ ${remaining[0].count} devices still have NULL token_hash. Cannot finalize.`,
    );
    process.exit(1);
  }

  // Make token_hash NOT NULL
  await prisma.$executeRaw`ALTER TABLE devices ALTER COLUMN token_hash SET NOT NULL`;

  // Drop the partial unique index and create a full one
  await prisma.$executeRaw`DROP INDEX IF EXISTS "devices_token_hash_provider_key"`;
  await prisma.$executeRaw`CREATE UNIQUE INDEX "devices_token_hash_provider_key" ON "devices"("token_hash", "provider")`;

  console.log("✅ token_hash is now NOT NULL with full unique constraint");
  console.log(
    "\n🎉 Migration complete! Push tokens are now encrypted at rest.",
  );
}

main()
  .catch((error) => {
    console.error("\n❌ Backfill failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
