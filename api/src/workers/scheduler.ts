/**
 * Scheduler Worker
 * Polls for scheduled notifications and campaigns, moves them to the queue
 */

import { prisma } from '../services/database';
import { addNotificationToQueue } from '../services/queue';

// Poll interval in milliseconds
const POLL_INTERVAL = parseInt(process.env.SCHEDULER_POLL_INTERVAL || '10000'); // 10 seconds
const BATCH_SIZE = parseInt(process.env.SCHEDULER_BATCH_SIZE || '100');

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Process scheduled notifications
 */
async function processScheduledNotifications(): Promise<number> {
    const now = new Date();

    // Find notifications that are SCHEDULED and ready to send
    const notifications = await prisma.notification.findMany({
        where: {
            status: 'SCHEDULED',
            sendAt: { lte: now },
        },
        take: BATCH_SIZE,
        orderBy: [
            { priority: 'desc' }, // HIGH first
            { sendAt: 'asc' },    // Oldest first
        ],
        select: {
            id: true,
            priority: true,
        },
    });

    if (notifications.length === 0) return 0;

    console.log(`[Scheduler] Found ${notifications.length} scheduled notifications ready to send`);

    // Update status to QUEUED and add to queue
    for (const notification of notifications) {
        try {
            await prisma.notification.update({
                where: { id: notification.id },
                data: { status: 'QUEUED' },
            });

            await addNotificationToQueue(
                notification.id,
                notification.priority as 'LOW' | 'NORMAL' | 'HIGH'
            );
        } catch (error) {
            console.error(`[Scheduler] Failed to queue notification ${notification.id}:`, error);
        }
    }

    return notifications.length;
}

/**
 * Process scheduled campaigns (bulk notifications)
 */
async function processScheduledCampaigns(): Promise<number> {
    const now = new Date();

    // Find campaigns that are SCHEDULED and ready to start
    const campaigns = await prisma.campaign.findMany({
        where: {
            status: 'SCHEDULED',
            scheduledAt: { lte: now },
        },
        take: 10, // Process fewer campaigns at once since they create many notifications
    });

    if (campaigns.length === 0) return 0;

    console.log(`[Scheduler] Found ${campaigns.length} scheduled campaigns ready to process`);

    for (const campaign of campaigns) {
        try {
            // Update status to PROCESSING
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: {
                    status: 'PROCESSING',
                    startedAt: now,
                },
            });

            // Get target users based on targeting mode
            let userIds: string[] = [];

            if (campaign.targetingMode === 'ALL') {
                // Get all users for the app
                const users = await prisma.user.findMany({
                    where: {
                        appId: campaign.appId,
                        deletedAt: null,
                    },
                    select: { externalUserId: true },
                });
                userIds = users.map(u => u.externalUserId);
            } else if (campaign.targetingMode === 'USER_LIST') {
                userIds = (campaign.targetUserIds as string[]) || [];
            } else if (campaign.targetingMode === 'CSV') {
                // CSV user IDs should be pre-processed and stored in targetUserIds
                userIds = (campaign.targetUserIds as string[]) || [];
            }

            // Update total targets
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: { totalTargets: userIds.length },
            });

            // Create notifications in batches
            const NOTIFICATION_BATCH_SIZE = 500;
            for (let i = 0; i < userIds.length; i += NOTIFICATION_BATCH_SIZE) {
                const batch = userIds.slice(i, i + NOTIFICATION_BATCH_SIZE);

                const notification = await prisma.notification.create({
                    data: {
                        appId: campaign.appId,
                        type: 'campaign',
                        status: 'QUEUED',
                        campaignId: campaign.id,
                        payload: {
                            userIds: batch,
                            adhocContent: {
                                title: campaign.title,
                                subtitle: campaign.subtitle,
                                body: campaign.body,
                                image: campaign.image,
                            },
                        },
                        priority: campaign.priority,
                        sendAt: now,
                        createdBy: campaign.createdBy,
                    },
                });

                await addNotificationToQueue(
                    notification.id,
                    campaign.priority as 'LOW' | 'NORMAL' | 'HIGH'
                );

                // Update processed count
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: {
                        processedCount: { increment: batch.length },
                    },
                });
            }

            // Mark campaign as completed
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                },
            });

            console.log(`[Scheduler] Campaign ${campaign.id} processed: ${userIds.length} users`);
        } catch (error) {
            console.error(`[Scheduler] Failed to process campaign ${campaign.id}:`, error);

            // Mark as failed but keep processing others
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: { status: 'CANCELLED' },
            }).catch(() => { });
        }
    }

    return campaigns.length;
}

/**
 * Process scheduled A/B tests
 */
async function processScheduledABTests(): Promise<number> {
    const now = new Date();

    // Find A/B tests that are ACTIVE and scheduled to start
    const tests = await prisma.aBTest.findMany({
        where: {
            status: 'ACTIVE',
            scheduledAt: { lte: now },
            startedAt: null,
        },
        include: {
            variants: true,
        },
        take: 10,
    });

    if (tests.length === 0) return 0;

    console.log(`[Scheduler] Found ${tests.length} A/B tests ready to start`);

    for (const test of tests) {
        try {
            // Get target users
            let userIds: string[] = [];

            if (test.targetingMode === 'ALL') {
                const users = await prisma.user.findMany({
                    where: {
                        appId: test.appId,
                        deletedAt: null,
                    },
                    select: { id: true, externalUserId: true },
                });
                userIds = users.map(u => u.externalUserId);
            } else if (test.targetingMode === 'USER_LIST') {
                userIds = (test.targetUserIds as string[]) || [];
            } else if (test.targetingMode === 'CSV') {
                userIds = (test.targetUserIds as string[]) || [];
            }

            // Assign users to variants using deterministic hashing
            const variants = test.variants;
            const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);

            for (const externalUserId of userIds) {
                // Deterministic hash for consistent assignment
                const hash = simpleHash(`${test.id}:${externalUserId}`);
                const normalizedHash = hash % totalWeight;

                let cumulativeWeight = 0;
                let assignedVariant = variants[0]!;

                for (const variant of variants) {
                    cumulativeWeight += variant.weight;
                    if (normalizedHash < cumulativeWeight) {
                        assignedVariant = variant;
                        break;
                    }
                }

                // Get internal user ID
                const user = await prisma.user.findFirst({
                    where: {
                        appId: test.appId,
                        externalUserId,
                        deletedAt: null,
                    },
                    select: { id: true },
                });

                if (!user) continue;

                // Create assignment
                await prisma.aBTestAssignment.upsert({
                    where: {
                        testId_userId: {
                            testId: test.id,
                            userId: user.id,
                        },
                    },
                    create: {
                        testId: test.id,
                        userId: user.id,
                        variantId: assignedVariant.id,
                    },
                    update: {
                        variantId: assignedVariant.id,
                    },
                });

                // Create notification for this user
                const notification = await prisma.notification.create({
                    data: {
                        appId: test.appId,
                        type: 'campaign',
                        status: 'QUEUED',
                        variantId: assignedVariant.id,
                        payload: {
                            userIds: [externalUserId],
                            adhocContent: {
                                title: assignedVariant.title,
                                subtitle: assignedVariant.subtitle,
                                body: assignedVariant.body,
                                image: assignedVariant.image,
                            },
                        },
                        priority: 'NORMAL',
                        sendAt: now,
                        createdBy: test.createdBy,
                    },
                });

                await addNotificationToQueue(notification.id, 'NORMAL');
            }

            // Mark test as started
            await prisma.aBTest.update({
                where: { id: test.id },
                data: {
                    startedAt: now,
                    completedAt: now, // For simple tests, complete immediately
                    status: 'COMPLETED',
                },
            });

            console.log(`[Scheduler] A/B test ${test.id} processed: ${userIds.length} users`);
        } catch (error) {
            console.error(`[Scheduler] Failed to process A/B test ${test.id}:`, error);
        }
    }

    return tests.length;
}

/**
 * Simple hash function for deterministic variant assignment
 */
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Main scheduler tick
 */
async function tick(): Promise<void> {
    if (!isRunning) return;

    try {
        const [notifCount, campaignCount, testCount] = await Promise.all([
            processScheduledNotifications(),
            processScheduledCampaigns(),
            processScheduledABTests(),
        ]);

        if (notifCount > 0 || campaignCount > 0 || testCount > 0) {
            console.log(
                `[Scheduler] Tick complete: ${notifCount} notifications, ` +
                `${campaignCount} campaigns, ${testCount} A/B tests`
            );
        }
    } catch (error) {
        console.error('[Scheduler] Tick failed:', error);
    }
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
    if (isRunning) {
        console.log('[Scheduler] Already running');
        return;
    }

    isRunning = true;
    console.log(`[Scheduler] Starting with ${POLL_INTERVAL}ms interval`);

    // Initial tick
    tick();

    // Schedule recurring ticks
    intervalId = setInterval(tick, POLL_INTERVAL);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
    if (!isRunning) return;

    isRunning = false;

    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    console.log('[Scheduler] Stopped');
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
    return isRunning;
}
