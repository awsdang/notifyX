import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../services/redis";

interface CacheOptions {
  duration?: number;
  private?: boolean;
  /** Enable server-side Redis caching (default: true if Redis is available) */
  serverCache?: boolean;
}

/**
 * Build a cache key from the request. Includes path + sorted query params
 * + admin user id (for per-user scoped data).
 */
function buildCacheKey(req: Request): string {
  const userId = req.adminUser?.id || "anon";
  const params = new URLSearchParams(req.query as Record<string, string>);
  params.sort();
  return `cache:${userId}:${req.originalUrl}?${params.toString()}`;
}

export const cache = (options: CacheOptions = {}) => {
  const duration = options.duration || 300; // 5 minutes default
  const useServerCache = options.serverCache !== false;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Set browser cache headers
    if (process.env.NODE_ENV === "production" && req.method === "GET") {
      res.set(
        "Cache-Control",
        `${options.private ? "private" : "public"}, max-age=${duration}`,
      );
    } else {
      res.set("Cache-Control", "no-store");
    }

    // Server-side Redis caching for GET requests
    if (
      useServerCache &&
      req.method === "GET" &&
      process.env.REDIS_DISABLED !== "true"
    ) {
      try {
        const redis = getRedisClient();
        const key = buildCacheKey(req);
        const cached = await redis.get(key);

        if (cached) {
          res.set("X-Cache", "HIT");
          return res.json(JSON.parse(cached));
        }

        // Intercept res.json to cache the response
        const originalJson = res.json.bind(res);
        res.json = (body: any) => {
          // Only cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            redis.setex(key, duration, JSON.stringify(body)).catch(() => {
              // Silently fail — cache is best-effort
            });
          }
          res.set("X-Cache", "MISS");
          return originalJson(body);
        };
      } catch {
        // Redis unavailable — proceed without cache
      }
    }

    next();
  };
};

/**
 * Invalidate cache keys matching a pattern (e.g. after mutation).
 * Call after create/update/delete operations.
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    if (process.env.REDIS_DISABLED === "true") return;
    const redis = getRedisClient();
    const keys = await redis.keys(`cache:*${pattern}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Best-effort
  }
}
