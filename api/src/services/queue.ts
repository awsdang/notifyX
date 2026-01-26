/**
 * Queue Service with proper configuration
 * Handles job queuing for push notifications
 */

import { Queue } from 'bullmq';
import { getRedisClient } from './redis';

export const NORMAL_QUEUE_NAME = 'notifications-normal';
export const HIGH_QUEUE_NAME = 'notifications-high';
export const DEAD_LETTER_QUEUE_NAME = 'notifications-dlq';

const redisConnection = getRedisClient();

// Maximum retries before moving to DLQ
const MAX_RETRIES = parseInt(process.env.DLQ_MAX_RETRIES || '5');

// NORMAL: Standard priority notifications
export const normalQueue = new Queue(NORMAL_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: MAX_RETRIES,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: { count: 1000, age: 3600 }, // Keep last 1000 or 1 hour
        removeOnFail: { count: 5000, age: 86400 },    // Keep failures for 24 hours
    },
});

// HIGH: Priority notifications (transactional, real-time)
export const highQueue = new Queue(HIGH_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: MAX_RETRIES,
        backoff: { type: 'exponential', delay: 10000 }, // Faster retry
        removeOnComplete: { count: 1000, age: 3600 },
        removeOnFail: { count: 5000, age: 86400 },
    },
});

// Dead Letter Queue for manual review
export const dlqQueue = new Queue(DEAD_LETTER_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: false, // Keep all for review
        removeOnFail: false,
    },
});

export type Priority = 'LOW' | 'NORMAL' | 'HIGH';

export async function addNotificationToQueue(
    notificationId: string, 
    priority: Priority = 'NORMAL',
    delay: number = 0
): Promise<string> {
    const jobData = { notificationId, queuedAt: Date.now() };
    
    // Map Priority to Queue
    // BullMQ: lower priority number = processed first
    if (priority === 'HIGH') {
        const job = await highQueue.add('send-notification', jobData, {
            priority: 1,
            delay,
        });
        return job.id || notificationId;
    } else {
        const job = await normalQueue.add('send-notification', jobData, {
            priority: priority === 'LOW' ? 10 : 5,
            delay,
        });
        return job.id || notificationId;
    }
}

export async function addToDeadLetterQueue(data: {
    originalJobId: string;
    notificationId: string;
    error: string;
    attempts: number;
}): Promise<void> {
    await dlqQueue.add('dead-letter', data);
}

// Queue health check
export async function getQueueHealth(): Promise<{
    normal: { waiting: number; active: number; failed: number };
    high: { waiting: number; active: number; failed: number };
}> {
    const [normalCounts, highCounts] = await Promise.all([
        normalQueue.getJobCounts('waiting', 'active', 'failed'),
        highQueue.getJobCounts('waiting', 'active', 'failed'),
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
    };
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
    await Promise.all([
        normalQueue.close(),
        highQueue.close(),
        dlqQueue.close(),
    ]);
    console.log('[Queue] All queues closed');
}
