import { prisma } from "./database";
import { decrypt } from "../utils/crypto";

const CACHE_TTL_MS = 60_000;

let cachedOrigins: Set<string> | null = null;
let cacheExpiresAt = 0;
let loadPromise: Promise<Set<string>> | null = null;

function normalizeOrigin(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function extractAllowedOrigins(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];

  const candidate = (payload as { allowedOrigins?: unknown }).allowedOrigins;
  if (!Array.isArray(candidate)) return [];

  return candidate
    .filter((value): value is string => typeof value === "string")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function loadOriginsFromCredentials(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedOrigins && now < cacheExpiresAt) {
    return cachedOrigins;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const versions = await prisma.credentialVersion.findMany({
      where: {
        isActive: true,
        credential: {
          provider: "web",
        },
      },
      select: {
        encryptedJson: true,
      },
    });

    const allowed = new Set<string>();

    for (const version of versions) {
      try {
        const decrypted = JSON.parse(decrypt(version.encryptedJson));
        const origins = extractAllowedOrigins(decrypted);

        for (const origin of origins) {
          const normalized = normalizeOrigin(origin);
          if (normalized) {
            allowed.add(normalized);
          }
        }
      } catch {
        // Ignore malformed/decryption failures and continue with remaining credentials.
      }
    }

    cachedOrigins = allowed;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    loadPromise = null;
    return allowed;
  })().catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}

export async function isOriginAllowedByWebCredentials(
  origin: string,
): Promise<boolean> {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowed = await loadOriginsFromCredentials();
  return allowed.has(normalized);
}

export function clearCorsOriginCache(): void {
  cachedOrigins = null;
  cacheExpiresAt = 0;
  loadPromise = null;
}
