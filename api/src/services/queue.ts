/**
 * Queue Service with proper configuration
 * Handles job queuing for push notifications
 */

import { Queue } from "bullmq";
import { getBullMQConnection } from "./redis";
import type {
  Priority,
  NotificationJobData,
  DeliveryJobData,
} from "../interfaces/services/queue";

export type { Priority, NotificationJobData, DeliveryJobData };

export const NORMAL_QUEUE_NAME = "notifications-normal";
export const HIGH_QUEUE_NAME = "notifications-high";

export const FCM_QUEUE_NAME = "notifications-fcm";
export const APNS_QUEUE_NAME = "notifications-apns";
export const HMS_QUEUE_NAME = "notifications-hms";
export const WEB_QUEUE_NAME = "notifications-web";

const REDIS_DISABLED = process.env.REDIS_DISABLED === "true";
if (REDIS_DISABLED) {
  console.warn("[Queue] REDIS_DISABLED=true, running queue operations in no-op mode");
}

// Use dedicated BullMQ connection (separate from app Redis client)
const redisConnection = REDIS_DISABLED ? null : getBullMQConnection();

// Maximum retries before moving to DLQ
const MAX_RETRIES = parseInt(process.env.DLQ_MAX_RETRIES || "3");

const defaultOptions = {
  attempts: MAX_RETRIES,
  backoff: { type: "exponential", delay: 10000 },
  removeOnComplete: { count: 1000, age: 3600 },
  removeOnFail: { count: 5000, age: 86400 },
};

function createNoopQueue(name: string): Queue {
  return {
    add: async () =>
      ({
        id: `${name}-noop-${Date.now()}`,
      }) as any,
    addBulk: async () => [],
    getJobCounts: async () => ({
      waiting: 0,
      active: 0,
      failed: 0,
    }),
    getJobs: async () => [],
    close: async () => {},
  } as unknown as Queue;
}

function createQueue(name: string): Queue {
  if (!redisConnection) {
    return createNoopQueue(name);
  }

  return new Queue(name, {
    connection: redisConnection,
    defaultJobOptions: defaultOptions,
  });
}

// NORMAL & HIGH are now flow control / explosion queues
export const normalQueue = createQueue(NORMAL_QUEUE_NAME);

export const highQueue = createQueue(HIGH_QUEUE_NAME);

// Provider Queues (where the actual work happens)
export const fcmQueue = createQueue(FCM_QUEUE_NAME);

export const apnsQueue = createQueue(APNS_QUEUE_NAME);

export const hmsQueue = createQueue(HMS_QUEUE_NAME);

export const webQueue = createQueue(WEB_QUEUE_NAME);

export async function addNotificationToQueue(
  notificationId: string,
  priority: Priority = "NORMAL",
  delay: number = 0,
): Promise<string> {
  if (REDIS_DISABLED) {
    return notificationId;
  }

  const jobData: NotificationJobData = { notificationId, queuedAt: Date.now() };

  // Map Priority to Queue
  // BullMQ: lower priority number = processed first
  const targetQueue = priority === "HIGH" ? highQueue : normalQueue;
  const jobPriority = priority === "HIGH" ? 1 : priority === "LOW" ? 10 : 5;

  const job = await targetQueue.add("explode-notification", jobData, {
    priority: jobPriority,
    delay,
  });
  return job.id || notificationId;
}

export async function addDeliveriesToQueue(
  deliveries: DeliveryJobData[],
  priority: Priority = "NORMAL",
): Promise<void> {
  if (REDIS_DISABLED || deliveries.length === 0) {
    return;
  }

  const jobPriority = priority === "HIGH" ? 1 : priority === "LOW" ? 10 : 5;

  // Group by provider for isolation and rate limiting
  const providerQueues: Record<string, Queue> = {
    fcm: fcmQueue,
    apns: apnsQueue,
    hms: hmsQueue,
    web: webQueue,
  };

  const grouped: Record<string, DeliveryJobData[]> = {};
  for (const d of deliveries) {
    const p = d.provider.toLowerCase();
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(d);
  }

  for (const [provider, batch] of Object.entries(grouped)) {
    const queue = providerQueues[provider] || normalQueue;
    await queue.addBulk(
      batch.map((d) => ({
        name: "delivery",
        data: d,
        opts: { priority: jobPriority },
      })),
    );
  }
}

export async function addToDeadLetterQueue(data: {
  originalJobId: string;
  notificationId: string;
  error: string;
  attempts: number;
}): Promise<void> {
  // For now, we'll just log this as the user wants to remove redundant state.
  // We could add to a specific DLQ queue if needed, but the user said "Pick one".
  console.error(
    `[DLQ] Notification ${data.notificationId} failed after ${data.attempts} attempts: ${data.error}`,
  );
}

/**
 * Enqueue a campaign for background explosion processing.
 * This keeps the scheduler tick lightweight — the heavy lifting of
 * iterating users and creating notifications happens in a worker.
 */
export async function addCampaignExplosionJob(
  campaignId: string,
  priority: Priority = "NORMAL",
): Promise<string> {
  if (REDIS_DISABLED) {
    return campaignId;
  }

  const jobPriority = priority === "HIGH" ? 1 : priority === "LOW" ? 10 : 5;
  const job = await normalQueue.add(
    "explode-campaign",
    { campaignId, queuedAt: Date.now() },
    {
      priority: jobPriority,
    },
  );
  return job.id || campaignId;
}

// Queue health check
export async function getQueueHealth(): Promise<{
  normal: { waiting: number; active: number; failed: number };
  high: { waiting: number; active: number; failed: number };
  providers: Record<
    string,
    { waiting: number; active: number; failed: number }
  >;
}> {
  if (REDIS_DISABLED) {
    return {
      normal: { waiting: 0, active: 0, failed: 0 },
      high: { waiting: 0, active: 0, failed: 0 },
      providers: {
        fcm: { waiting: 0, active: 0, failed: 0 },
        apns: { waiting: 0, active: 0, failed: 0 },
        hms: { waiting: 0, active: 0, failed: 0 },
        web: { waiting: 0, active: 0, failed: 0 },
      },
    };
  }

  const [
    normalCounts,
    highCounts,
    fcmCounts,
    apnsCounts,
    hmsCounts,
    webCounts,
  ] = await Promise.all([
    normalQueue.getJobCounts("waiting", "active", "failed"),
    highQueue.getJobCounts("waiting", "active", "failed"),
    fcmQueue.getJobCounts("waiting", "active", "failed"),
    apnsQueue.getJobCounts("waiting", "active", "failed"),
    hmsQueue.getJobCounts("waiting", "active", "failed"),
    webQueue.getJobCounts("waiting", "active", "failed"),
  ]);

  return {
    normal: {
      waiting: normalCounts.waiting || 0,
      active: normalCounts.active || 0,
      failed: normalCounts.failed || 0,
    },
    high: {
      waiting: highCounts.waiting || 0,
      active: highCounts.active || 0,
      failed: highCounts.failed || 0,
    },
    providers: {
      fcm: {
        waiting: fcmCounts.waiting || 0,
        active: fcmCounts.active || 0,
        failed: fcmCounts.failed || 0,
      },
      apns: {
        waiting: apnsCounts.waiting || 0,
        active: apnsCounts.active || 0,
        failed: apnsCounts.failed || 0,
      },
      hms: {
        waiting: hmsCounts.waiting || 0,
        active: hmsCounts.active || 0,
        failed: hmsCounts.failed || 0,
      },
      web: {
        waiting: webCounts.waiting || 0,
        active: webCounts.active || 0,
        failed: webCounts.failed || 0,
      },
    },
  };
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  if (REDIS_DISABLED) {
    return;
  }

  await Promise.all([
    normalQueue.close(),
    highQueue.close(),
    fcmQueue.close(),
    apnsQueue.close(),
    hmsQueue.close(),
    webQueue.close(),
  ]);
  console.log("[Queue] All queues closed");
}
