import type { Request } from 'express';

export interface RateLimitEntry {
    count: number;
    resetAt: number;
    queuedRequests: number;
}

export interface RateLimitOptions {
    windowMs?: number;
    max?: number;
    keyGenerator?: (req: Request) => string;
    skip?: (req: Request) => boolean;
    queueExceeded?: boolean;
    maxQueueDelay?: number;
}
