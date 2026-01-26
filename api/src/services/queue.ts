/**
 * Queue Service with proper configuration
 * Handles job queuing for push notifications
 */

import { Queue } from 'bullmq';
import { getRedisClient } from './redis';
import type { Priority, NotificationJobData, DeliveryJobData } from '../interfaces/services/queue';

export type { Priority, NotificationJobData, DeliveryJobData };

export const NORMAL_QUEUE_NAME = 'notifications-normal';
export const HIGH_QUEUE_NAME = 'notifications-high';

export const FCM_QUEUE_NAME = 'notifications-fcm';
export const APNS_QUEUE_NAME = 'notifications-apns';
export const HMS_QUEUE_NAME = 'notifications-hms';
export const WEB_QUEUE_NAME = 'notifications-web';

const redisConnection = getRedisClient();

// Maximum retries before moving to DLQ
const MAX_RETRIES = parseInt(process.env.DLQ_MAX_RETRIES || '3');

const defaultOptions = {
    attempts: MAX_RETRIES,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 1000, age: 3600 },
    removeOnFail: { count: 5000, age: 86400 },
};

// NORMAL & HIGH are now flow control / explosion queues
export const normalQueue = new Queue(NORMAL_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: defaultOptions,
});

export const highQueue = new Queue(HIGH_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: defaultOptions,
});

// Provider Queues (where the actual work happens)
export const fcmQueue = new Queue(FCM_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: defaultOptions,
});

export const apnsQueue = new Queue(APNS_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: defaultOptions,
});

export const hmsQueue = new Queue(HMS_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: defaultOptions,
});

export const webQueue = new Queue(WEB_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: defaultOptions,
});

export async function addNotificationToQueue(
    notificationId: string,
    priority: Priority = 'NORMAL',
    delay: number = 0
): Promise<string> {
    const jobData: NotificationJobData = { notificationId, queuedAt: Date.now() };

    // Map Priority to Queue
    // BullMQ: lower priority number = processed first
    const targetQueue = priority === 'HIGH' ? highQueue : normalQueue;
    const jobPriority = priority === 'HIGH' ? 1 : (priority === 'LOW' ? 10 : 5);

    const job = await targetQueue.add('explode-notification', jobData, {
        priority: jobPriority,
        delay,
    });
    return job.id || notificationId;
}

export async function addDeliveriesToQueue(
    deliveries: DeliveryJobData[],
    priority: Priority = 'NORMAL'
): Promise<void> {
    const jobPriority = priority === 'HIGH' ? 1 : (priority === 'LOW' ? 10 : 5);

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
        await queue.addBulk(batch.map(d => ({
            name: 'delivery',
            data: d,
            opts: { priority: jobPriority }
        })));
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
    console.error(`[DLQ] Notification ${data.notificationId} failed after ${data.attempts} attempts: ${data.error}`);
}

// Queue health check
export async function getQueueHealth(): Promise<{
    normal: { waiting: number; active: number; failed: number };
    high: { waiting: number; active: number; failed: number };
    providers: Record<string, { waiting: number; active: number; failed: number }>;
}> {
    const [normalCounts, highCounts, fcmCounts, apnsCounts, hmsCounts, webCounts] = await Promise.all([
        normalQueue.getJobCounts('waiting', 'active', 'failed'),
        highQueue.getJobCounts('waiting', 'active', 'failed'),
        fcmQueue.getJobCounts('waiting', 'active', 'failed'),
        apnsQueue.getJobCounts('waiting', 'active', 'failed'),
        hmsQueue.getJobCounts('waiting', 'active', 'failed'),
        webQueue.getJobCounts('waiting', 'active', 'failed'),
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
            fcm: { waiting: fcmCounts.waiting || 0, active: fcmCounts.active || 0, failed: fcmCounts.failed || 0 },
            apns: { waiting: apnsCounts.waiting || 0, active: apnsCounts.active || 0, failed: apnsCounts.failed || 0 },
            hms: { waiting: hmsCounts.waiting || 0, active: hmsCounts.active || 0, failed: hmsCounts.failed || 0 },
            web: { waiting: webCounts.waiting || 0, active: webCounts.active || 0, failed: webCounts.failed || 0 },
        }
    };
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
    await Promise.all([
        normalQueue.close(),
        highQueue.close(),
        fcmQueue.close(),
        apnsQueue.close(),
        hmsQueue.close(),
        webQueue.close(),
    ]);
    console.log('[Queue] All queues closed');
}
