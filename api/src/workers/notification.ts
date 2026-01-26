/**
 * Notification Worker
 * Processes queued notifications and sends via push providers
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../services/redis';
import { prisma } from '../services/database';
import {
    NORMAL_QUEUE_NAME,
    HIGH_QUEUE_NAME,
    FCM_QUEUE_NAME,
    APNS_QUEUE_NAME,
    HMS_QUEUE_NAME,
    WEB_QUEUE_NAME,
    addDeliveriesToQueue,
    type NotificationJobData,
    type DeliveryJobData,
    type Priority
} from '../services/queue';
import { sendPush, type ProviderType, type PushMessage } from '../services/push-providers';
import { addToDeadLetterQueue } from '../services/deadLetterQueue';

interface NotificationPayload {
    userIds?: string[];
    adhocContent?: {
        title?: string;
        subtitle?: string;
        body?: string;
        image?: string;
        actionUrl?: string;
        data?: Record<string, string>;
    };
    variables?: Record<string, string>;
}

const redisConnection = getRedisClient();

// Worker instances for graceful shutdown
const workers: Worker[] = [];

/**
 * Process a notification job
 */
async function processJob(job: Job): Promise<void> {
    const jobName = job.name;
    const queueName = job.queueName;

    if (jobName === 'explode-notification') {
        await handleExplosion(job as Job<NotificationJobData>);
    } else if (jobName === 'delivery') {
        await handleDelivery(job as Job<DeliveryJobData>);
    } else {
        console.warn(`[Worker-${queueName}] Unknown job name: ${jobName}`);
    }
}

/**
 * Handle "Explosion" phase: Find devices and queue individual deliveries
 */
async function handleExplosion(job: Job<NotificationJobData>): Promise<void> {
    const { notificationId } = job.data;
    const startTime = Date.now();

    console.log(`[Worker-Explosion] Exploding ${notificationId}`);

    const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
    });

    if (!notification) return;

    const payload = notification.payload as NotificationPayload;
    const userIds = payload?.userIds || [];

    // Chunk user fetching for very large audiences
    // For now, doing it in one go (but restricted by app_id)
    const users = await prisma.user.findMany({
        where: {
            appId: notification.appId,
            externalUserId: { in: userIds },
            deletedAt: null,
        },
        include: {
            devices: {
                where: { isActive: true, tokenInvalidAt: null },
            },
        },
    });

    const devices = users.flatMap(u => u.devices);

    if (devices.length === 0) {
        await prisma.notification.update({
            where: { id: notificationId },
            data: { status: 'NO_DEVICES' },
        });
        return;
    }

    // Queue deliveries in batches to avoid overloading Redis
    const BATCH_SIZE = 500;
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
        const batch = devices.slice(i, i + BATCH_SIZE);
        const deliveries: DeliveryJobData[] = batch.map(d => ({
            notificationId,
            deviceId: d.id,
            appId: notification.appId,
            provider: d.provider,
            priority: (notification.priority as Priority) || 'NORMAL',
        }));

        await addDeliveriesToQueue(deliveries, (notification.priority as Priority) || 'NORMAL');
    }

    console.log(`[Worker-Explosion] Queued ${devices.length} deliveries for ${notificationId} in ${Date.now() - startTime}ms`);
}

/**
 * Handle "Delivery" phase: Send actual push to a single device
 */
async function handleDelivery(job: Job<DeliveryJobData>): Promise<void> {
    const { notificationId, deviceId, appId } = job.data;

    const [notification, device] = await Promise.all([
        prisma.notification.findUnique({
            where: { id: notificationId },
            include: { template: true },
        }),
        prisma.device.findUnique({
            where: { id: deviceId },
        }),
    ]);

    if (!notification || !device || !device.isActive) return;

    const payload = notification.payload as NotificationPayload;

    // 1. Build content
    let title = payload.adhocContent?.title || notification.template?.title || 'Notification';
    let subtitle = payload.adhocContent?.subtitle || notification.template?.subtitle;
    let body = payload.adhocContent?.body || notification.template?.body || '';
    let image = payload.adhocContent?.image || notification.template?.image;
    const actionUrl = payload.adhocContent?.actionUrl;

    if (payload.variables) {
        for (const [key, value] of Object.entries(payload.variables)) {
            title = title.replace(new RegExp(`{{${key}}}`, 'g'), value);
            if (subtitle) subtitle = subtitle.replace(new RegExp(`{{${key}}}`, 'g'), value);
            body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
    }

    const message: PushMessage = {
        token: device.pushToken,
        title,
        subtitle: subtitle || undefined,
        body,
        image: image || undefined,
        actionUrl: actionUrl || undefined,
        data: payload.adhocContent?.data || payload.variables,
    };

    // 2. Create delivery record (PENDING)
    const delivery = await prisma.notificationDelivery.create({
        data: {
            notificationId,
            deviceId: device.id,
            provider: device.provider,
            status: 'PENDING',
            attempts: job.attemptsMade + 1,
        },
    });

    // 3. Send
    const result = await sendPush(device.provider as ProviderType, message, appId);

    // 4. Update status
    if (result.success) {
        await prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: { status: 'DELIVERED', sentAt: new Date() },
        });

        // Optimization: Update notification status to 'SENT' if it's the last one? 
        // Better to have a separate cleanup job or just leave as is for stats aggregation.
    } else {
        let failureCategory = 'UNKNOWN';
        if (result.invalidToken) failureCategory = 'INVALID_TOKEN';
        else if (result.error?.includes('Rate Limit')) failureCategory = 'RATE_LIMITED';

        await prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
                status: result.shouldRetry ? 'RETRY' : 'FAILED',
                lastError: result.error,
                errorCode: result.errorCode,
                failureCategory,
                providerReason: result.error
            },
        });

        if (result.invalidToken) {
            await prisma.device.update({
                where: { id: device.id },
                data: { isActive: false, tokenInvalidAt: new Date(), deactivationReason: 'INVALID_TOKEN_AUTO' },
            });
        }

        if (!result.shouldRetry || job.attemptsMade >= (job.opts.attempts || 3)) {
            await addToDeadLetterQueue({
                notificationId,
                deliveryId: delivery.id,
                provider: device.provider as ProviderType,
                payload: {
                    token: message.token,
                    title: message.title,
                    body: message.body,
                    data: message.data
                },
                errorMessage: result.error || 'Max retries',
                errorCode: result.errorCode,
                attempts: job.attemptsMade,
            });
        } else {
            throw new Error(result.error || 'Retry requested by provider');
        }
    }
}

/**
 * Initialize notification workers
 */
export function initWorker() {
    const queueConfigs = [
        { name: NORMAL_QUEUE_NAME, concurrency: 5 },
        { name: HIGH_QUEUE_NAME, concurrency: 20 },
        { name: FCM_QUEUE_NAME, concurrency: 50, limiter: { max: 1000, duration: 1000 } },
        { name: APNS_QUEUE_NAME, concurrency: 50, limiter: { max: 500, duration: 1000 } },
        { name: HMS_QUEUE_NAME, concurrency: 30, limiter: { max: 300, duration: 1000 } },
        { name: WEB_QUEUE_NAME, concurrency: 20, limiter: { max: 200, duration: 1000 } },
    ];

    for (const config of queueConfigs) {
        const worker = new Worker(config.name, processJob, {
            connection: redisConnection,
            concurrency: config.concurrency,
            limiter: config.limiter,
        });

        worker.on('failed', (job, err) => {
            console.error(`[Worker-${config.name}] Job ${job?.id} failed:`, err.message);
        });

        workers.push(worker);
    }

    console.log(`[Worker] Started ${workers.length} worker instances across all queues`);
}

/**
 * Graceful shutdown of workers
 */
export async function shutdownWorkers(): Promise<void> {
    console.log('[Worker] Shutting down workers...');
    await Promise.all(workers.map(w => w.close()));
    console.log('[Worker] All workers shut down');
}
