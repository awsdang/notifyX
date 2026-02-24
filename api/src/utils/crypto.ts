import crypto from "crypto";

/**
 * Credential Encryption Utility
 *
 * Uses AES-256-GCM (authenticated encryption) with:
 *   - Random 16-byte salt per encryption (no fixed salt)
 *   - scrypt key derivation (N=16384, r=8, p=1)
 *   - 12-byte random IV (GCM recommended)
 *   - 16-byte auth tag for tamper detection
 *
 * CREDENTIAL_ENCRYPTION_KEY is REQUIRED — no fallback default.
 * The key should be a high-entropy string (≥32 chars). It is stretched
 * through scrypt together with a random salt, so it does not need to be
 * exactly 32 bytes, but longer is better.
 */

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;

function assertKeyConfigured(): string {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY env variable is required and must be at least 32 characters. " +
        "Generate one with: openssl rand -base64 48",
    );
  }
  return ENCRYPTION_KEY;
}

// Validate at import-time so the process fails fast on misconfiguration.
// Wrapped in a try so tests can stub the env var before first use.
let _keyValidated = false;

function getKey(salt: Buffer): Buffer {
  if (!_keyValidated) {
    assertKeyConfigured();
    _keyValidated = true;
  }
  return crypto.scryptSync(ENCRYPTION_KEY!, salt, 32, { N: 16384, r: 8, p: 1 });
}

// --- AES-256-GCM constants ---
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const SALT_LENGTH = 16; // random salt per encryption
const TAG_LENGTH = 16; // 128-bit auth tag

export interface EncryptedPayload {
  /** hex-encoded: salt(16) + iv(12) + authTag(16) + ciphertext */
  iv: string;
  encryptedData: string;
  [key: string]: string; // index signature for Prisma InputJsonValue compat
}

/**
 * Encrypt plaintext using AES-256-GCM with a per-message random salt + IV.
 * Returns an object with `iv` and `encryptedData` (both hex) for backward
 * compatibility with the Prisma Json column shape.
 */
export function encrypt(text: string): EncryptedPayload {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey(salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Pack everything into encryptedData so the column shape stays { iv, encryptedData }
  // Layout: salt(16) | iv(12) | authTag(16) | ciphertext(…)
  const packed = Buffer.concat([salt, iv, authTag, encrypted]);

  return {
    iv: iv.toString("hex"), // kept for schema compat (not used during decrypt)
    encryptedData: packed.toString("hex"),
  };
}

/**
 * Decrypt a payload produced by `encrypt()`.
 *
 * Also supports **legacy AES-256-CBC payloads** (iv + encryptedData without
 * the salt|iv|tag packing) so that existing credentials don't break on upgrade.
 * Legacy payloads are detected by length heuristics (the packed GCM format
 * always has ≥ SALT+IV+TAG = 44 prefix bytes).
 */
export function decrypt(encrypted: any): string {
  const enc = encrypted as { iv: string; encryptedData: string };
  const encBuf = Buffer.from(enc.encryptedData, "hex");

  // --- Legacy CBC detection ---
  // In the old format, `iv` is 16 bytes hex and `encryptedData` is raw ciphertext
  // without the 44-byte prefix. We detect legacy by checking whether the packed
  // buffer is too short to contain salt+iv+tag, OR if extracting the embedded IV
  // doesn't match the stored `iv` field (which was the CBC IV).
  const minGcmLen = SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1; // at least 1 byte ciphertext
  if (encBuf.length < minGcmLen) {
    return decryptLegacyCBC(enc);
  }

  const embeddedIvHex = encBuf
    .subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
    .toString("hex");
  if (embeddedIvHex !== enc.iv) {
    // The stored iv doesn't match the embedded GCM iv — this is a legacy CBC payload
    return decryptLegacyCBC(enc);
  }

  // --- GCM path ---
  const salt = encBuf.subarray(0, SALT_LENGTH);
  const iv = encBuf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = encBuf.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
  );
  const ciphertext = encBuf.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = getKey(salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Decrypt legacy AES-256-CBC payloads (pre-upgrade data).
 * Uses the old fixed-salt derivation so existing credentials remain readable.
 * @deprecated Will be removed once all credentials are re-encrypted.
 */
function decryptLegacyCBC(encrypted: {
  iv: string;
  encryptedData: string;
}): string {
  const iv = Buffer.from(encrypted.iv, "hex");
  const encryptedData = Buffer.from(encrypted.encryptedData, "hex");
  // Legacy derivation used fixed 'salt' string
  const key = crypto.scryptSync(ENCRYPTION_KEY!, "salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Hash a push token using SHA-256 for lookups.
 * Never store or log the raw token — only the hash.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Encrypt a push token for secure storage.
 * Returns the hex-encoded ciphertext.
 */
export function encryptToken(token: string): string {
  const payload = encrypt(token);
  return JSON.stringify(payload);
}

/**
 * Decrypt a push token from storage.
 */
export function decryptToken(encrypted: string): string {
  const payload = JSON.parse(encrypted);
  return decrypt(payload);
}

/**
 * Decrypt token when stored encrypted, otherwise return original value.
 * Supports legacy plaintext tokens during migration.
 */
export function decryptTokenIfNeeded(token: string): string {
  if (!token) return token;

  const trimmed = token.trim();
  if (!trimmed.startsWith("{")) {
    return token;
  }

  try {
    return decryptToken(token);
  } catch {
    return token;
  }
}
