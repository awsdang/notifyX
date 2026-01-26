/**
 * Redis Client with Connection Management
 * Supports clustering and proper lifecycle
 */

import IORedis from 'ioredis';

// Global singleton
let redisClient: IORedis | null = null;
let subscriberClient: IORedis | null = null;

const createRedisClient = (): IORedis => {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    
    const client = new IORedis(url, {
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: true,
        lazyConnect: true,
        // Connection pool like behavior
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
    });

    client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
    });

    client.on('connect', () => {
        console.log('[Redis] Connected');
    });

    client.on('ready', () => {
        console.log('[Redis] Ready to accept commands');
    });

    return client;
};

export function getRedisClient(): IORedis {
    if (!redisClient) {
        redisClient = createRedisClient();
    }
    return redisClient;
}

// Separate client for subscriptions (Redis requires dedicated connection for pub/sub)
export function getSubscriberClient(): IORedis {
    if (!subscriberClient) {
        subscriberClient = createRedisClient();
    }
    return subscriberClient;
}

// Health check
export async function checkRedisHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const client = getRedisClient();
    const start = Date.now();
    
    try {
        const result = await client.ping();
        return { 
            healthy: result === 'PONG', 
            latency: Date.now() - start 
        };
    } catch (error) {
        return { 
            healthy: false, 
            latency: Date.now() - start,
            error: error instanceof Error ? error.message : 'Unknown error' 
        };
    }
}

// Graceful disconnect
export async function disconnectRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
    if (subscriberClient) {
        await subscriberClient.quit();
        subscriberClient = null;
    }
    console.log('[Redis] Disconnected');
}
