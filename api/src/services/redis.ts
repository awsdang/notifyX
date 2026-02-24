/**
 * Redis Client with Connection Management
 * Supports separate connections for BullMQ and application use.
 * Spec: "BullMQ recommends separate connections."
 */

import IORedis from "ioredis";

// Global singletons
let redisClient: IORedis | null = null;
let subscriberClient: IORedis | null = null;
let bullmqClient: IORedis | null = null;

const createRedisClient = (options: { forBullMQ?: boolean } = {}): IORedis => {
  const url = process.env.REDIS_URL || "redis://localhost:6379";

  const client = new IORedis(url, {
    maxRetriesPerRequest: options.forBullMQ ? null : 3, // null required for BullMQ
    enableReadyCheck: true,
    lazyConnect: true,
    // Connection pool like behavior
    keepAlive: 30000,
    connectTimeout: 10000,
    // BullMQ relies on long-lived/blocked Redis commands.
    // Applying low command timeouts can cause worker failures.
    ...(options.forBullMQ ? {} : { commandTimeout: 5000 }),
  });

  const label = options.forBullMQ ? "Redis:BullMQ" : "Redis:App";

  client.on("error", (err) => {
    console.error(`[${label}] Connection error:`, err.message);
  });

  client.on("connect", () => {
    console.log(`[${label}] Connected`);
  });

  client.on("ready", () => {
    console.log(`[${label}] Ready to accept commands`);
  });

  return client;
};

/**
 * Application Redis client — for caching, rate limiting, locks.
 * Has maxRetriesPerRequest=3 for fast failure.
 */
export function getRedisClient(): IORedis {
  if (!redisClient) {
    redisClient = createRedisClient({ forBullMQ: false });
  }
  return redisClient;
}

/**
 * BullMQ-dedicated Redis connection.
 * Has maxRetriesPerRequest=null as required by BullMQ.
 * Prevents BullMQ from starving application Redis commands under load.
 */
export function getBullMQConnection(): IORedis {
  if (!bullmqClient) {
    bullmqClient = createRedisClient({ forBullMQ: true });
  }
  return bullmqClient;
}

// Separate client for subscriptions (Redis requires dedicated connection for pub/sub)
export function getSubscriberClient(): IORedis {
  if (!subscriberClient) {
    subscriberClient = createRedisClient();
  }
  return subscriberClient;
}

// Health check
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
}> {
  const client = getRedisClient();
  const start = Date.now();

  try {
    const result = await client.ping();
    return {
      healthy: result === "PONG",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Graceful disconnect
export async function disconnectRedis(): Promise<void> {
  const clients = [redisClient, subscriberClient, bullmqClient];
  await Promise.all(
    clients.filter(Boolean).map((c) => c!.quit().catch(() => {})),
  );
  redisClient = null;
  subscriberClient = null;
  bullmqClient = null;
  console.log("[Redis] All connections disconnected");
}
