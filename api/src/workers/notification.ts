/**
 * Notification Worker
 * Processes queued notifications and sends via push providers
 */

import { Worker, Job } from "bullmq";
import { getBullMQConnection, getRedisClient } from "../services/redis";
import { prisma } from "../services/database";
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
  type Priority,
} from "../services/queue";
import {
  sendPush,
  type ProviderType,
  type PushMessage,
} from "../services/push-providers";
import { addToDeadLetterQueue } from "../services/deadLetterQueue";
import { processCampaignExplosion } from "./campaignExplosion";
import type { NotificationPayload } from "../interfaces/workers/notification";
import { decryptTokenIfNeeded } from "../utils/crypto";
import { resolvePushMessageIcons, withAppIconData } from "../utils/appIcons";

// BullMQ requires maxRetriesPerRequest=null — use dedicated connection
const redisConnection = getBullMQConnection();

// Worker instances for graceful shutdown
const workers: Worker[] = [];
const WORKER_VERBOSE = process.env.WORKER_VERBOSE === "true";

/**
 * Process a notification job
 */
async function processJob(job: Job): Promise<void> {
  const jobName = job.name;
  const queueName = job.queueName;

  if (jobName === "explode-notification") {
    await handleExplosion(job as Job<NotificationJobData>);
  } else if (jobName === "explode-campaign") {
    await processCampaignExplosion(job.data.campaignId);
  } else if (jobName === "delivery") {
    await handleDelivery(job as Job<DeliveryJobData>);
  } else {
    console.warn(`[Worker-${queueName}] Unknown job name: ${jobName}`);
  }
}

/**
 * Handle "Explosion" phase: Find devices and queue individual deliveries.
 *
 * Uses cursor-based pagination so the full user+device graph is never
 * loaded into memory at once.  Each page of users is fetched, flat-mapped
 * to active devices, and enqueued before the next page is fetched.
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
  const platforms =
    payload?.platforms && payload.platforms.length > 0
      ? payload.platforms
      : undefined;

  // ── Paginated fan-out ────────────────────────────────────────────
  const PAGE_SIZE = 200; // users per DB page
  const ENQUEUE_BATCH = 500; // deliveries per Redis bulk-add
  let totalDevices = 0;
  let pendingDeliveries: DeliveryJobData[] = [];

  /**
   * Flush accumulated deliveries to the queue.
   */
  const flushDeliveries = async () => {
    if (pendingDeliveries.length === 0) return;
    await addDeliveriesToQueue(
      pendingDeliveries,
      (notification.priority as Priority) || "NORMAL",
    );
    pendingDeliveries = [];
  };

  const enqueueUserDevices = (users: Array<{ devices: Array<{ id: string; provider: string }> }>) => {
    for (const user of users) {
      for (const device of user.devices) {
        pendingDeliveries.push({
          notificationId,
          deviceId: device.id,
          appId: notification.appId,
          provider: device.provider,
          priority: (notification.priority as Priority) || "NORMAL",
        });
        totalDevices++;
      }
    }
  };

  const deviceWhere = {
    isActive: true,
    tokenInvalidAt: null,
    ...(platforms ? { platform: { in: platforms } } : {}),
  };

  if (userIds.length > 0) {
    // Targeted fan-out: only users explicitly selected by external user ID
    for (let offset = 0; offset < userIds.length; offset += PAGE_SIZE) {
      const userIdPage = userIds.slice(offset, offset + PAGE_SIZE);

      const users = await prisma.user.findMany({
        where: {
          appId: notification.appId,
          externalUserId: { in: userIdPage },
          deletedAt: null,
        },
        select: {
          devices: {
            where: deviceWhere,
            select: { id: true, provider: true },
          },
        },
      });

      enqueueUserDevices(users);
      if (pendingDeliveries.length >= ENQUEUE_BATCH) {
        await flushDeliveries();
      }
    }
  } else {
    // Broadcast fan-out: no explicit users means "all subscribed users in app"
    let cursorId: string | undefined;
    while (true) {
      const users = await prisma.user.findMany({
        where: {
          appId: notification.appId,
          deletedAt: null,
        },
        select: {
          id: true,
          devices: {
            where: deviceWhere,
            select: { id: true, provider: true },
          },
        },
        orderBy: { id: "asc" },
        take: PAGE_SIZE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });

      if (users.length === 0) break;
      cursorId = users[users.length - 1]?.id;

      enqueueUserDevices(users);
      if (pendingDeliveries.length >= ENQUEUE_BATCH) {
        await flushDeliveries();
      }
    }
  }

  // Flush remaining deliveries
  await flushDeliveries();

  if (totalDevices === 0) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: "NO_DEVICES" },
    });
    console.log(
      `[Worker-Explosion] No eligible devices for ${notificationId}; marked as NO_DEVICES in ${Date.now() - startTime}ms`,
    );
    return;
  }

  // Store total expected deliveries in Redis for O(1) finalization
  const redis = getRedisClient();
  await redis.set(`notif:${notificationId}:total`, totalDevices);
  // Initialize counters
  await redis.set(`notif:${notificationId}:delivered`, 0);
  await redis.set(`notif:${notificationId}:failed`, 0);
  // Set TTL (7 days) to auto-cleanup
  const TTL = 7 * 24 * 60 * 60;
  await redis.expire(`notif:${notificationId}:total`, TTL);
  await redis.expire(`notif:${notificationId}:delivered`, TTL);
  await redis.expire(`notif:${notificationId}:failed`, TTL);

  console.log(
    `[Worker-Explosion] Queued ${totalDevices} deliveries for ${notificationId} in ${Date.now() - startTime}ms`,
  );
}

/**
 * Handle "Delivery" phase: Send actual push to a single device
 */
async function handleDelivery(job: Job<DeliveryJobData>): Promise<void> {
  const { notificationId, deviceId, appId } = job.data;

  const [notification, device] = await Promise.all([
    prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        template: true,
        app: {
          select: {
            notificationIconUrl: true,
            androidNotificationIcon: true,
          },
        },
      },
    }),
    prisma.device.findUnique({
      where: { id: deviceId },
    }),
  ]);

  if (!notification || !device || !device.isActive) return;

  const payload = notification.payload as NotificationPayload;

  // 1. Build content
  let title =
    payload.adhocContent?.title ||
    notification.template?.title ||
    "Notification";
  let subtitle =
    payload.adhocContent?.subtitle || notification.template?.subtitle;
  let body = payload.adhocContent?.body || notification.template?.body || "";
  let image = payload.adhocContent?.image || notification.template?.image;
  const actions = (payload.adhocContent?.actions || [])
    .filter((action) => action?.title && action?.url)
    .slice(0, 2)
    .map((action, index) => ({
      action: index === 0 ? "open_link_primary" : "open_link_secondary",
      title: String(action.title).trim(),
      url: String(action.url).trim(),
    }));
  const actionUrl = payload.adhocContent?.actionUrl || actions[0]?.url;
  const actionUrlMap: Record<string, string> = {};
  for (const action of actions) {
    if (action.action && action.url) {
      actionUrlMap[`actionUrl_${action.action}`] = action.url;
    }
  }

  if (payload.variables) {
    for (const [key, value] of Object.entries(payload.variables)) {
      // Use replaceAll with a literal string — avoids regex and prevents
      // ReDoS if `key` contains special regex characters.
      const placeholder = `{{${key}}}`;
      title = title.replaceAll(placeholder, value);
      if (subtitle) subtitle = subtitle.replaceAll(placeholder, value);
      body = body.replaceAll(placeholder, value);
    }
  }

  const resolvedToken = decryptTokenIfNeeded(device.pushToken);
  const messageIcons = resolvePushMessageIcons(
    notification.app,
    payload.adhocContent?.icon,
  );

  const message: PushMessage = {
    token: resolvedToken,
    title,
    subtitle: subtitle || undefined,
    body,
    image: image || undefined,
    icon: messageIcons.icon,
    androidIcon: messageIcons.androidIcon,
    actionUrl: actionUrl || undefined,
    actions: actions.length > 0 ? actions : undefined,
    data: withAppIconData(
      {
        ...(payload.adhocContent?.data || payload.variables || {}),
        ...(actionUrl ? { actionUrl } : {}),
        ...(actions.length > 0 ? { actions: JSON.stringify(actions) } : {}),
        ...actionUrlMap,
      },
      messageIcons.icon,
    ),
  };

  // 2. Create delivery record (PENDING)
  const delivery = await prisma.notificationDelivery.create({
    data: {
      notificationId,
      deviceId: device.id,
      provider: device.provider,
      status: "PENDING",
      attempts: job.attemptsMade + 1,
    },
  });

  // 3. Send
  const result = await sendPush(
    device.provider as ProviderType,
    message,
    appId,
  );

  if (WORKER_VERBOSE) {
    console.log(
      `[Worker-Delivery] notif=${notificationId} device=${device.id} provider=${device.provider} image=${Boolean(message.image)} actions=${message.actions?.length || 0} success=${result.success} error=${result.error || "none"}`,
    );
  }

  // 4. Update status + increment Redis counters
  const redis = getRedisClient();
  if (result.success) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", sentAt: new Date() },
    });
    await redis.incr(`notif:${notificationId}:delivered`);
  } else {
    let failureCategory = "UNKNOWN";
    if (result.invalidToken) failureCategory = "INVALID_TOKEN";
    else if (result.error?.includes("Rate Limit"))
      failureCategory = "RATE_LIMITED";

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.shouldRetry ? "RETRY" : "FAILED",
        lastError: result.error,
        errorCode: result.errorCode,
        failureCategory,
        providerReason: result.error,
      },
    });

    if (result.invalidToken) {
      await prisma.device.update({
        where: { id: device.id },
        data: {
          isActive: false,
          tokenInvalidAt: new Date(),
          deactivationReason: "INVALID_TOKEN_AUTO",
        },
      });
    }

    if (!result.shouldRetry || job.attemptsMade >= (job.opts.attempts || 3)) {
      console.error(
        `[Worker-Delivery-Failed] notif=${notificationId} delivery=${delivery.id} device=${device.id} provider=${device.provider} attempts=${job.attemptsMade + 1} errorCode=${result.errorCode || "UNKNOWN"} invalidToken=${result.invalidToken} error=${result.error || "unknown"}`,
      );

      // Terminal failure — increment failed counter
      await redis.incr(`notif:${notificationId}:failed`);
      await addToDeadLetterQueue({
        notificationId,
        deliveryId: delivery.id,
        provider: device.provider as ProviderType,
        payload: {
          deviceId: device.id,
          title: message.title,
          body: message.body,
          dataKeys: message.data ? Object.keys(message.data) : [],
        },
        errorMessage: result.error || "Max retries",
        errorCode: result.errorCode,
        attempts: job.attemptsMade + 1,
      });
    } else {
      throw new Error(result.error || "Retry requested by provider");
    }
  }

  // ── Finalize parent notification status via Redis counters ─────
  // O(1) per delivery instead of O(N) groupBy query.
  await tryFinalizeNotification(notificationId);
}

/**
 * Atomically increment Redis counters for this notification and check
 * if all deliveries are done.  When delivered + failed == total, update
 * the parent notification status in the DB.
 *
 * This replaces the per-delivery `groupBy` approach which ran N queries
 * for a notification targeting N devices.
 */
async function tryFinalizeNotification(notificationId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const totalStr = await redis.get(`notif:${notificationId}:total`);
    if (!totalStr) return; // explosion hasn't set the count yet, or TTL expired

    const total = parseInt(totalStr, 10);
    const [deliveredStr, failedStr] = await Promise.all([
      redis.get(`notif:${notificationId}:delivered`),
      redis.get(`notif:${notificationId}:failed`),
    ]);

    const delivered = parseInt(deliveredStr || "0", 10);
    const failed = parseInt(failedStr || "0", 10);
    const completed = delivered + failed;

    if (completed < total) return; // still in-flight

    let finalStatus: string;
    if (failed === 0) {
      finalStatus = "SENT";
    } else if (delivered === 0) {
      finalStatus = "FAILED";
    } else {
      finalStatus = "PARTIAL";
    }

    // Only transition from QUEUED → terminal to avoid overwriting manual states
    await prisma.notification.updateMany({
      where: { id: notificationId, status: "QUEUED" },
      data: { status: finalStatus },
    });

    // Cleanup Redis keys
    await redis
      .del(
        `notif:${notificationId}:total`,
        `notif:${notificationId}:delivered`,
        `notif:${notificationId}:failed`,
      )
      .catch(() => {});
  } catch (error) {
    // Non-critical — log and move on; a periodic cleanup job can fix orphans
    console.error(
      `[Worker] Failed to finalize notification ${notificationId}:`,
      error,
    );
  }
}

/**
 * Initialize notification workers
 */
export function initWorker() {
  const queueConfigs = [
    { name: NORMAL_QUEUE_NAME, concurrency: 5 },
    { name: HIGH_QUEUE_NAME, concurrency: 20 },
    {
      name: FCM_QUEUE_NAME,
      concurrency: 50,
      limiter: { max: 1000, duration: 1000 },
    },
    {
      name: APNS_QUEUE_NAME,
      concurrency: 50,
      limiter: { max: 500, duration: 1000 },
    },
    {
      name: HMS_QUEUE_NAME,
      concurrency: 30,
      limiter: { max: 300, duration: 1000 },
    },
    {
      name: WEB_QUEUE_NAME,
      concurrency: 20,
      limiter: { max: 200, duration: 1000 },
    },
  ];

  for (const config of queueConfigs) {
    const worker = new Worker(config.name, processJob, {
      connection: redisConnection,
      concurrency: config.concurrency,
      limiter: config.limiter,
    });

    worker.on("failed", (job, err) => {
      console.error(
        `[Worker-${config.name}] Job ${job?.id} failed:`,
        err.message,
      );
    });

    workers.push(worker);
  }

  console.log(
    `[Worker] Started ${workers.length} worker instances across all queues`,
  );
}

/**
 * Graceful shutdown of workers
 */
export async function shutdownWorkers(): Promise<void> {
  console.log("[Worker] Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  console.log("[Worker] All workers shut down");
}
