/**
 * Rate Limiting Middleware
 * Uses Redis for distributed rate limiting across multiple instances
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/response';
import { getRedisClient } from '../services/redis';

import type { RateLimitEntry, RateLimitOptions } from '../interfaces/middleware/rateLimit';

export type { RateLimitEntry, RateLimitOptions };

const memoryStore = new Map<string, RateLimitEntry>();

const useRedis = process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_USE_REDIS === 'true';

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
        if (entry.resetAt < now) {
            memoryStore.delete(key);
        }
    }
}, 60000);


async function checkRateLimitRedis(
    key: string,
    windowMs: number,
    max: number,
    queueExceeded: boolean
): Promise<{ count: number; resetAt: number; allowed: boolean; delayMs: number }> {
    const redis = getRedisClient();
    const redisKey = `ratelimit:${key}`;
    const now = Date.now();

    try {
        const pipeline = redis.multi();
        pipeline.incr(redisKey);
        pipeline.pttl(redisKey);

        const results = await pipeline.exec();
        const count = (results?.[0]?.[1] as number) || 1;
        const ttl = (results?.[1]?.[1] as number) || -1;

        if (ttl === -1) {
            await redis.pexpire(redisKey, windowMs);
        }

        const resetAt = now + (ttl > 0 ? ttl : windowMs);

        if (count <= max) {
            return { count, resetAt, allowed: true, delayMs: 0 };
        }

        if (queueExceeded) {
            const excessCount = count - max;
            const delayMs = Math.min(excessCount * 100, 30000);
            return { count, resetAt, allowed: true, delayMs };
        }

        return { count, resetAt, allowed: false, delayMs: 0 };
    } catch (error) {
        console.warn('[RateLimit] Redis error, falling back to memory:', error);
        return checkRateLimitMemory(key, windowMs, max, queueExceeded);
    }
}

function checkRateLimitMemory(
    key: string,
    windowMs: number,
    max: number,
    queueExceeded: boolean
): { count: number; resetAt: number; allowed: boolean; delayMs: number } {
    const now = Date.now();
    let entry = memoryStore.get(key);

    if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + windowMs, queuedRequests: 0 };
        memoryStore.set(key, entry);
    }

    entry.count++;

    if (entry.count <= max) {
        return { count: entry.count, resetAt: entry.resetAt, allowed: true, delayMs: 0 };
    }

    if (queueExceeded) {
        entry.queuedRequests++;
        const delayMs = Math.min(entry.queuedRequests * 100, 30000);
        return { count: entry.count, resetAt: entry.resetAt, allowed: true, delayMs };
    }

    return { count: entry.count, resetAt: entry.resetAt, allowed: false, delayMs: 0 };
}

export function rateLimit(options: RateLimitOptions = {}) {
    const windowMs = options.windowMs ?? parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
    const max = options.max ?? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
    const keyGenerator = options.keyGenerator ?? defaultKeyGenerator;
    const skip = options.skip ?? defaultSkip;
    const queueExceeded = options.queueExceeded ?? true;
    const maxQueueDelay = options.maxQueueDelay ?? 30000;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (skip(req)) {
            return next();
        }

        const key = keyGenerator(req);

        const result = useRedis
            ? await checkRateLimitRedis(key, windowMs, max, queueExceeded)
            : checkRateLimitMemory(key, windowMs, max, queueExceeded);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - result.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

        if (!result.allowed) {
            const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
            res.setHeader('Retry-After', retryAfter);

            return next(new AppError(
                429,
                `Rate limit exceeded. Try again in ${retryAfter} seconds`,
                'RATE_LIMIT_EXCEEDED'
            ));
        }

        if (result.delayMs > 0) {
            res.setHeader('X-RateLimit-Delayed', result.delayMs);

            if (result.delayMs > maxQueueDelay) {
                const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
                res.setHeader('Retry-After', retryAfter);

                return next(new AppError(
                    429,
                    `Rate limit exceeded. Maximum queue delay exceeded.`,
                    'RATE_LIMIT_QUEUE_FULL'
                ));
            }

            // Instead of blocking the connection, we pass the delay to the controller
            // to queue the job with a delay
            res.locals.rateLimitDelay = result.delayMs;
            // await new Promise(resolve => setTimeout(resolve, result.delayMs));
        }

        next();
    };
}

function defaultKeyGenerator(req: Request): string {
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
        return `api:${apiKey}`;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
}

function defaultSkip(req: Request): boolean {
    return req.path === '/health' ||
        req.path === '/openapi.json' ||
        req.path.startsWith('/reference');
}

export const eventRateLimit = rateLimit({
    windowMs: 1000,
    max: 100,
    queueExceeded: true,
    maxQueueDelay: 5000,
});

export const campaignRateLimit = rateLimit({
    windowMs: 60000,
    max: 10,
    queueExceeded: true,
    maxQueueDelay: 10000,
});

export const strictRateLimit = rateLimit({
    windowMs: 60000,
    max: 30,
    queueExceeded: false,
});
