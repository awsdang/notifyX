import { z } from "zod";

/**
 * VAPID key format: base64url-encoded P-256 curve keys.
 * Public keys are 65 bytes uncompressed (starts with 0x04).
 * Private keys are 32 bytes raw or variable-length PKCS8 DER.
 */
const base64urlPattern = /^[A-Za-z0-9_-]+$/;

function normalizeOrigin(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
        }
        return parsed.origin.toLowerCase();
    } catch {
        return null;
    }
}

const allowedOriginsSchema = z
    .preprocess((value) => {
        if (typeof value === "string") {
            return value
                .split(/[\n,]/)
                .map((v) => v.trim())
                .filter(Boolean);
        }

        if (Array.isArray(value)) {
            return value
                .map((v) => String(v).trim())
                .filter(Boolean);
        }

        return [];
    }, z.array(z.string().min(1)).max(100))
    .transform((origins, ctx) => {
        const deduped: string[] = [];
        const seen = new Set<string>();

        origins.forEach((origin, index) => {
            const normalized = normalizeOrigin(origin);
            if (!normalized) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [index],
                    message: `Invalid origin: ${origin}`,
                });
                return;
            }

            if (!seen.has(normalized)) {
                seen.add(normalized);
                deduped.push(normalized);
            }
        });

        return deduped;
    });

/**
 * Validation schema for Web Push (VAPID) credentials
 */
export const webPushCredentialSchema = z.object({
    vapidPublicKey: z
        .string()
        .min(20, "VAPID public key is too short")
        .regex(base64urlPattern, "VAPID public key must be base64url encoded"),
    vapidPrivateKey: z
        .string()
        .min(20, "VAPID private key is too short")
        .regex(base64urlPattern, "VAPID private key must be base64url encoded"),
    subject: z
        .string()
        .min(1, "Subject is required")
        .refine(
            (val) => val.startsWith("mailto:") || val.startsWith("https://"),
            "Subject must start with mailto: or https://",
        ),
    allowedOrigins: allowedOriginsSchema.optional().default([]),
});

/**
 * Validation schema for FCM credentials
 */
export const fcmCredentialSchema = z.object({
    projectId: z.string().min(1, "Project ID is required"),
    clientEmail: z.string().email("Client email must be a valid email"),
    privateKey: z
        .string()
        .min(1, "Private key is required")
        .refine(
            (val) => val.includes("BEGIN PRIVATE KEY"),
            "Private key must be in PEM format",
        ),
});

/**
 * Validation schema for APNS credentials
 */
export const apnsCredentialSchema = z.object({
    keyId: z
        .string()
        .min(1, "Key ID is required")
        .max(20, "Key ID is too long"),
    teamId: z
        .string()
        .min(1, "Team ID is required")
        .max(20, "Team ID is too long"),
    bundleId: z.string().min(1, "Bundle ID is required"),
    privateKey: z
        .string()
        .min(1, "Private key is required")
        .refine(
            (val) => val.includes("BEGIN PRIVATE KEY"),
            "Private key must be in PEM format",
        ),
    production: z.boolean().default(false),
});

/**
 * Validation schema for HMS credentials
 */
export const hmsCredentialSchema = z.object({
    appId: z.string().min(1, "App ID is required"),
    appSecret: z.string().min(1, "App secret is required"),
});

/**
 * Map of provider → schema for dynamic validation
 */
export const credentialSchemaMap: Record<string, z.ZodType> = {
    web: webPushCredentialSchema,
    fcm: fcmCredentialSchema,
    apns: apnsCredentialSchema,
    hms: hmsCredentialSchema,
};
