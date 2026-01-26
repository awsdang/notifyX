/**
 * Notification Worker
 * Processes queued notifications and sends via push providers
 */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../services/redis';
import { prisma } from '../services/database';
import { NORMAL_QUEUE_NAME, HIGH_QUEUE_NAME } from '../services/queue';
import { sendPush, type ProviderType, type PushMessage } from '../services/push-providers';
import { addToDeadLetterQueue } from '../services/deadLetterQueue';

const redisConnection = getRedisClient();

// Worker instances for graceful shutdown
let normalWorker: Worker | null = null;
let highWorker: Worker | null = null;

interface JobData {
    notificationId: string;
    queuedAt?: number;
}

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

/**
 * Process a notification job
 */
async function processJob(job: Job<JobData>): Promise<void> {
    const { notificationId } = job.data;
    const queueName = job.queueName;
    const startTime = Date.now();

    console.log(`[Worker-${queueName}] Processing ${notificationId}`);

    try {
        // 1. Fetch Notification with template
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
            include: { template: true },
        });

        if (!notification) {
            console.warn(`[Worker] Notification ${notificationId} not found`);
            return;
        }

        // 2. Parse payload
        const payload = notification.payload as NotificationPayload;
        const userIds = payload?.userIds || [];

        // 3. Get devices for target users
        const users = await prisma.user.findMany({
            where: {
                appId: notification.appId,
                externalUserId: { in: userIds },
                deletedAt: null,
            },
            include: {
                devices: {
                    where: {
                        isActive: true,
                        tokenInvalidAt: null,
                    },
                },
            },
        });

        // 4. Flatten devices
        const devices = users.flatMap(u => u.devices);

        if (devices.length === 0) {
            console.log(`[Worker] No active devices for notification ${notificationId}`);
            await prisma.notification.update({
                where: { id: notificationId },
                data: { status: 'NO_DEVICES' },
            });
            return;
        }

        // 5. Build message content
        let title = payload.adhocContent?.title || notification.template?.title || 'Notification';
        let subtitle = payload.adhocContent?.subtitle || notification.template?.subtitle;
        let body = payload.adhocContent?.body || notification.template?.body || '';
        let image = payload.adhocContent?.image || notification.template?.image;
        const actionUrl = payload.adhocContent?.actionUrl;

        // Replace template variables
        if (payload.variables) {
            for (const [key, value] of Object.entries(payload.variables)) {
                title = title.replace(new RegExp(`{{${key}}}`, 'g'), value);
                if (subtitle) subtitle = subtitle.replace(new RegExp(`{{${key}}}`, 'g'), value);
                body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
            }
        }

        // 6. Create delivery records and send
        let successCount = 0;
        let failedCount = 0;

        for (const device of devices) {
            const delivery = await prisma.notificationDelivery.create({
                data: {
                    notificationId,
                    deviceId: device.id,
                    provider: device.provider,
                    status: 'PENDING',
                    attempts: 1,
                },
            });

            const message: PushMessage = {
                token: device.pushToken,
                title,
                subtitle: subtitle || undefined,
                body,
                image: image || undefined,
                actionUrl: actionUrl || undefined,
                data: payload.adhocContent?.data || payload.variables,
            };

            // Send via appropriate provider (with per-app credentials)
            const result = await sendPush(device.provider as ProviderType, message, notification.appId);

            if (result.success) {
                successCount++;
                await prisma.notificationDelivery.update({
                    where: { id: delivery.id },
                    data: {
                        status: 'DELIVERED',
                        sentAt: new Date(),
                    },
                });
            } else {
                failedCount++;

                // Categorize error (Phase 3)
                let failureCategory = 'UNKNOWN';
                if (result.invalidToken) failureCategory = 'INVALID_TOKEN';
                else if (result.error?.includes('Rate Limit')) failureCategory = 'RATE_LIMITED';
                else if (result.error?.includes('Credential')) failureCategory = 'CREDENTIAL_ERROR';
                else if (result.error?.includes('Network')) failureCategory = 'NETWORK_ERROR';
                else if (!result.shouldRetry) failureCategory = 'PROVIDER_ERROR';

                // Update delivery record
                await prisma.notificationDelivery.update({
                    where: { id: delivery.id },
                    data: {
                        status: result.shouldRetry ? 'RETRY' : 'FAILED',
                        lastError: result.error,
                        errorCode: result.errorCode,
                        failureCategory,
                        providerReason: result.error || 'Unknown provider error'
                    },
                });

                // Handle invalid token - deactivate device
                if (result.invalidToken) {
                    await prisma.device.update({
                        where: { id: device.id },
                        data: {
                            isActive: false,
                            tokenInvalidAt: new Date(),
                            deactivationReason: 'INVALID_TOKEN_AUTO',
                            deactivatedBy: 'SYSTEM'
                        },
                    });
                    console.log(`[Worker] Deactivated invalid token for device ${device.id}`);
                }

                // Check if max retries exceeded
                if (!result.shouldRetry || job.attemptsMade >= (job.opts.attempts || 5)) {
                    await addToDeadLetterQueue({
                        notificationId,
                        deliveryId: delivery.id,
                        provider: device.provider as ProviderType,
                        payload: message,
                        errorMessage: result.error || 'Unknown error',
                        errorCode: result.errorCode,
                        attempts: job.attemptsMade,
                    });
                }
            }
        }

        // 7. Update notification status
        const finalStatus = failedCount === 0 ? 'SENT' :
            successCount === 0 ? 'FAILED' : 'PARTIAL';

        await prisma.notification.update({
            where: { id: notificationId },
            data: { status: finalStatus },
        });

        const duration = Date.now() - startTime;
        console.log(
            `[Worker-${queueName}] Completed ${notificationId}: ` +
            `${successCount}/${devices.length} delivered in ${duration}ms`
        );

    } catch (error) {
        console.error(`[Worker-${queueName}] Failed ${notificationId}:`, error);

        // Update status to failed
        await prisma.notification.update({
            where: { id: notificationId },
            data: { status: 'FAILED' },
        }).catch(() => { }); // Ignore if notification doesn't exist

        throw error; // Re-throw for BullMQ retry handling
    }
}

/**
 * Initialize notification workers
 */
export function initWorker(): { normalWorker: Worker; highWorker: Worker } {
    // Normal Worker: Conservative concurrency
    normalWorker = new Worker(NORMAL_QUEUE_NAME, processJob, {
        connection: redisConnection,
        concurrency: parseInt(process.env.NORMAL_WORKER_CONCURRENCY || '5'),
        limiter: {
            max: parseInt(process.env.NORMAL_WORKER_RATE_LIMIT || '50'),
            duration: 1000,
        },
    });

    // High Worker: Higher throughput
    highWorker = new Worker(HIGH_QUEUE_NAME, processJob, {
        connection: redisConnection,
        concurrency: parseInt(process.env.HIGH_WORKER_CONCURRENCY || '20'),
        limiter: {
            max: parseInt(process.env.HIGH_WORKER_RATE_LIMIT || '500'),
            duration: 1000,
        },
    });

    // Event handlers
    [normalWorker, highWorker].forEach(worker => {
        worker.on('completed', (job) => {
            console.log(`[Worker] Job ${job.id} completed`);
        });

        worker.on('failed', (job, err) => {
            console.error(`[Worker] Job ${job?.id} failed:`, err.message);
        });

        worker.on('error', (err) => {
            console.error('[Worker] Worker error:', err.message);
        });
    });

    console.log('[Worker] Notification Workers Started (High & Normal)');
    return { normalWorker, highWorker };
}

/**
 * Graceful shutdown of workers
 */
export async function shutdownWorkers(): Promise<void> {
    console.log('[Worker] Shutting down workers...');

    const closePromises: Promise<void>[] = [];

    if (normalWorker) {
        closePromises.push(normalWorker.close());
    }
    if (highWorker) {
        closePromises.push(highWorker.close());
    }

    await Promise.all(closePromises);
    console.log('[Worker] All workers shut down');
}
