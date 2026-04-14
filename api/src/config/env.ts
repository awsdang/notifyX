/**
 * Environment Configuration with Zod Validation
 * Fail-fast at startup if required env vars are missing or malformed.
 * Spec: "Validate env at startup with Zod."
 */

import { z } from "zod";

const envSchema = z
  .object({
    // ── Core ────────────────────────────────────────────────────────
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    TRUST_PROXY: z
      .string()
      .default("false")
      .transform((v) => v === "true" || v === "1"),

    // ── Database ────────────────────────────────────────────────────
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    /** Prisma connection pool size. Recommended: (cpu_cores * 2) + 1 per process */
    DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),

    // ── Redis ───────────────────────────────────────────────────────
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    REDIS_DISABLED: z
      .string()
      .default("false")
      .transform((v) => v === "true"),

    // ── Auth / Secrets ──────────────────────────────────────────────
    API_KEYS: z.string().optional(), // legacy comma-separated fallback
    API_KEY_HASH_SECRET: z.string().optional(), // pepper for HMAC
    ADMIN_SETUP_TOKEN: z.string().optional(),

    // ── Credential Encryption ───────────────────────────────────────
    CREDENTIAL_ENCRYPTION_KEY: z
      .string()
      .min(32, "CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters")
      .optional(),

    // ── CORS ────────────────────────────────────────────────────────
    CORS_ORIGIN: z.string().optional(),
    CORS_DISABLE: z
      .string()
      .default("false")
      .transform((v) => v === "true" || v === "1"),

    // ── Metrics ─────────────────────────────────────────────────────
    MONITORING_TOKEN: z.string().optional(),

    // ── Queue Controls ──────────────────────────────────────────────
    DLQ_MAX_RETRIES: z.coerce.number().int().positive().default(3),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_USE_REDIS: z
      .string()
      .default("false")
      .transform((v) => v === "true"),

    // ── Scheduler ───────────────────────────────────────────────────
    SCHEDULER_POLL_INTERVAL: z.coerce.number().int().positive().default(10000),
    SCHEDULER_BATCH_SIZE: z.coerce.number().int().positive().default(100),
    SCHEDULER_LOCK_TTL_MS: z.coerce.number().int().positive().default(30000),

    // ── Campaign Approvals ──────────────────────────────────────────
    REQUIRE_CAMPAIGN_APPROVAL: z
      .string()
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.CREDENTIAL_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CREDENTIAL_ENCRYPTION_KEY"],
          message:
            "CREDENTIAL_ENCRYPTION_KEY is required in production (min 32 chars)",
        });
      }

      // If legacy API_KEYS are configured, pepper should also be configured.
      const hasApiKeys = !!data.API_KEYS?.split(",").some((k) => k.trim());
      if (hasApiKeys && !data.API_KEY_HASH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["API_KEY_HASH_SECRET"],
          message:
            "API_KEY_HASH_SECRET is required in production when legacy API_KEYS is set",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Validate and parse environment variables.
 * Call once at startup after `dotenv.config()`.
 * Throws with clear message on failure.
 */
export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    console.error(
      `\n[Config] ❌ Environment validation failed:\n${formatted}\n`,
    );
    process.exit(1);
  }

  _env = result.data;

  // Warn about missing recommended vars in production
  if (_env.NODE_ENV === "production") {
    if (_env.CORS_DISABLE) {
      console.warn(
        "[Config] ⚠ CORS_DISABLE=true — all browser origins are allowed. Use only for temporary debugging.",
      );
    }
    if (!_env.API_KEYS) {
      console.warn(
        "[Config] ℹ API_KEYS not set — using DB-backed API keys only (recommended)",
      );
    }
    if (!_env.MONITORING_TOKEN) {
      console.warn(
        "[Config] ⚠ MONITORING_TOKEN not set — /metrics endpoints are unprotected",
      );
    }
    if (!_env.API_KEY_HASH_SECRET) {
      console.warn(
        "[Config] ⚠ API_KEY_HASH_SECRET not set — API keys are hashed without pepper",
      );
    }
  }

  return _env;
}

/**
 * Get validated env (throws if validateEnv() was not called first).
 */
export function getEnv(): Env {
  if (!_env) {
    throw new Error(
      "[Config] Environment not validated. Call validateEnv() at startup.",
    );
  }
  return _env;
}
