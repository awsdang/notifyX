/**
 * API Key Authentication Middleware
 * Hashes API keys at startup and uses timing-safe comparison.
 * Spec: "Store API keys hashed (never store plaintext)."
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AppError } from "../utils/response";
import { prisma } from "../services/database";

const prismaClient = prisma as any;

/**
 * Hash an API key using SHA-256 + optional pepper from env.
 * This is a one-way hash used for comparison only.
 */
export function hashApiKey(key: string): string {
  const pepper = process.env.API_KEY_HASH_SECRET || "";
  return crypto.createHmac("sha256", pepper).update(key).digest("hex");
}

// Cache: store hashed API keys (never raw)
let validApiKeyHashes: Set<string> | null = null;

function getApiKeyHashes(): Set<string> {
  if (validApiKeyHashes) return validApiKeyHashes;

  const keys =
    process.env.API_KEYS?.split(",")
      .map((k) => k.trim())
      .filter(Boolean) || [];
  // Store only hashes — raw keys are discarded after this
  validApiKeyHashes = new Set(keys.map(hashApiKey));
  return validApiKeyHashes;
}

// Clear cache when needed (for testing)
export function clearApiKeyCache(): void {
  validApiKeyHashes = null;
}

declare global {
  namespace Express {
    interface Request {
      machineAuth?: {
        keyId: string;
        appId: string;
        scopes: string[];
      };
    }
  }
}

/**
 * Timing-safe comparison of two hex strings.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Check if an incoming API key matches any of the stored hashes
 * using timing-safe comparison.
 */
function isValidApiKey(apiKey: string): boolean {
  const incomingHash = hashApiKey(apiKey);
  const hashes = getApiKeyHashes();

  for (const storedHash of hashes) {
    if (timingSafeCompare(incomingHash, storedHash)) {
      return true;
    }
  }
  return false;
}

function getRequiredScope(req: Request): string | null {
  const path = req.path.replace(/^\/api\/v1/, "");
  const method = req.method.toUpperCase();

  if (path === "/notifications" && method === "POST") {
    return "notifications:send";
  }
  if (path.startsWith("/notifications/") && method === "POST") {
    if (path.endsWith("/test")) return "notifications:test";
    return "notifications:manage";
  }
  if (path.startsWith("/events/") && method === "POST") {
    return "events:send";
  }
  if (path === "/users" && method === "POST") {
    return "users:write";
  }
  if (path === "/users/device" && method === "POST") {
    return "devices:write";
  }
  if (path.startsWith("/devices/") && method === "PATCH") {
    return "devices:write";
  }
  if (path.startsWith("/templates") && method === "GET") {
    return "templates:read";
  }

  if (process.env.NODE_ENV !== "production" && path === "/assets/upload" && method === "POST") {
    return null; // Allow any valid API key to upload in dev
  }

  return null;
}

function extractRequestedAppId(req: Request): string | null {
  const bodyAppId = req.body?.appId;
  if (typeof bodyAppId === "string" && bodyAppId) {
    return bodyAppId;
  }

  const paramAppId = req.params?.appId;
  if (typeof paramAppId === "string" && paramAppId) {
    return paramAppId;
  }

  const queryAppId = req.query?.appId;
  if (typeof queryAppId === "string" && queryAppId) {
    return queryAppId;
  }

  return null;
}

function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Route prefixes that use their own authentication (e.g. admin JWT via
 * `authenticateAdmin`) and therefore must NOT be gated by the global
 * API-key middleware.  Keep this list in sync with the admin-auth
 * route mounts in index.ts / routes.ts.
 */
const ADMIN_AUTH_PREFIXES = [
  // Versioned paths
  "/api/v1/admin",
  "/api/v1/apps",
  "/api/v1/stats",
  "/api/v1/audit",
  "/api/v1/orgs",
  "/api/v1/uploads",
  "/api/v1/campaigns",
  "/api/v1/ab-tests",
  "/api/v1/automations",
  "/api/v1/automation-triggers",
];

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Skip auth for health check and docs (public / ops endpoints)
    if (
      req.path === "/health" ||
      req.path === "/ready" ||
      req.path === "/openapi.json" ||
      req.path.startsWith("/reference") ||
      req.path.startsWith("/docs")
    ) {
      return next();
    }

    // Metrics require dedicated token auth — handled separately in index.ts
    if (req.path.startsWith("/metrics")) {
      return next();
    }

    // Skip API-key auth for routes that authenticate via admin JWT + RBAC.
    // Each of these routers already enforces `authenticateAdmin` per-handler.
    if (ADMIN_AUTH_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      return next();
    }

    // If a valid admin session token is provided, allow request to continue.
    // This enables admin-initiated operations (e.g. portal send/simulator)
    // on routes that also support machine API keys.
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const rawToken = authHeader.replace("Bearer ", "").trim();
      if (rawToken) {
        const tokenHash = hashSessionToken(rawToken);
        const session = await prismaClient.adminSession.findUnique({
          where: { token: tokenHash },
          include: {
            adminUser: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
              },
            },
          },
        });

        if (
          session &&
          session.expiresAt > new Date() &&
          session.adminUser?.isActive
        ) {
          req.adminUser = {
            id: session.adminUser.id,
            email: session.adminUser.email,
            name: session.adminUser.name,
            role: session.adminUser.role,
          };
          return next();
        }
      }
    }

    const apiKey = req.headers["x-api-key"] as string | undefined;

    if (!apiKey) {
      return next(new AppError(401, "API key required", "UNAUTHORIZED"));
    }

    const incomingHash = hashApiKey(apiKey);
    const now = new Date();

    // Preferred path: DB-backed API keys (scoped + rotatable)
    const dbApiKey = await prismaClient.apiKey.findFirst({
      where: {
        keyHash: incomingHash,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        appId: true,
        scopes: true,
      },
    });

    if (dbApiKey) {
      const requestedAppId = extractRequestedAppId(req);
      if (requestedAppId && requestedAppId !== dbApiKey.appId) {
        return next(
          new AppError(403, "API key is not scoped to this app", "FORBIDDEN"),
        );
      }

      const requiredScope = getRequiredScope(req);
      const hasWildcard = dbApiKey.scopes.includes("*");
      const hasScope =
        !requiredScope ||
        dbApiKey.scopes.length === 0 ||
        hasWildcard ||
        dbApiKey.scopes.includes(requiredScope);

      if (!hasScope) {
        return next(new AppError(403, "Missing API key scope", "FORBIDDEN"));
      }

      req.machineAuth = {
        keyId: dbApiKey.id,
        appId: dbApiKey.appId,
        scopes: dbApiKey.scopes,
      };

      void prismaClient.apiKey
        .update({
          where: { id: dbApiKey.id },
          data: { lastUsedAt: now },
        })
        .catch(() => { });

      return next();
    }

    const hashes = getApiKeyHashes();

    // In development, allow if no keys configured
    if (hashes.size === 0 && process.env.NODE_ENV !== "production") {
      console.warn(
        "[Auth] No API keys configured - allowing request in development mode",
      );
      return next();
    }

    if (!isValidApiKey(apiKey)) {
      return next(new AppError(401, "Invalid API key", "UNAUTHORIZED"));
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

import type { AuthContext } from "../interfaces/middleware/auth";

export type { AuthContext };

export function getAuthContext(req: Request): AuthContext | null {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) return null;

  // Return a hashed identifier — never expose the raw key
  return {
    apiKey: hashApiKey(apiKey),
    keyId: req.machineAuth?.keyId,
    appId: req.machineAuth?.appId,
    scopes: req.machineAuth?.scopes,
  };
}
