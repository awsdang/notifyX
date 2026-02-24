/**
 * Scheduler Worker
 * Polls for scheduled notifications and campaigns, moves them to the queue.
 *
 * Hardening (v2):
 *   - Distributed lock via Redis SET NX to prevent duplicate processing across instances.
 *   - Bulk status updates via Prisma transactions / updateMany to reduce DB write amplification.
 *   - Skipped-tick guard: if a tick is still running when the next interval fires, it is skipped.
 */

import { prisma } from "../services/database";
import {
  addNotificationToQueue,
  addCampaignExplosionJob,
} from "../services/queue";
import { getRedisClient } from "../services/redis";
import { chooseABTestFanoutStrategy } from "../services/abTestFanout";
import { processExecution } from "../services/automation-engine";

// Poll interval in milliseconds
const POLL_INTERVAL = parseInt(process.env.SCHEDULER_POLL_INTERVAL || "10000"); // 10 seconds
const BATCH_SIZE = parseInt(process.env.SCHEDULER_BATCH_SIZE || "100");
const STALE_QUEUED_RECOVERY_MS = parseInt(
  process.env.SCHEDULER_STALE_QUEUED_RECOVERY_MS || "120000",
); // 2 minutes

/** How long the distributed lock is held (ms). Should be > max expected tick duration. */
const LOCK_TTL_MS = parseInt(process.env.SCHEDULER_LOCK_TTL_MS || "30000");
const LOCK_KEY = "notifyx:scheduler:lock";

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;
/** Guard: prevents overlapping ticks within the same process. */
let tickInProgress = false;

// ─── Distributed lock helpers ────────────────────────────────────────

/**
 * Attempt to acquire a Redis-based distributed lock.
 * Returns a release function on success, or `null` if the lock is held elsewhere.
 */
async function acquireLock(): Promise<(() => Promise<void>) | null> {
  try {
    const redis = getRedisClient();
    const lockValue = `${process.pid}:${Date.now()}`;

    // SET key value NX PX ttl — atomic acquire
    const result = await redis.set(
      LOCK_KEY,
      lockValue,
      "PX",
      LOCK_TTL_MS,
      "NX",
    );

    if (result !== "OK") return null;

    // Return a release function that only deletes if we still own the lock
    return async () => {
      try {
        const current = await redis.get(LOCK_KEY);
        if (current === lockValue) {
          await redis.del(LOCK_KEY);
        }
      } catch {
        // Best-effort release; TTL will expire regardless
      }
    };
  } catch (error) {
    // Redis unavailable — fall through and allow in-process guard only
    console.warn(
      "[Scheduler] Redis lock unavailable, falling back to single-instance mode:",
      (error as Error).message,
    );
    return async () => {}; // no-op release
  }
}

// ─── Notification processing ─────────────────────────────────────────

async function processScheduledNotifications(): Promise<number> {
  const now = new Date();

  // Atomically claim SCHEDULED notifications that are ready to send.
  // Uses UPDATE … RETURNING with a sub-select + FOR UPDATE SKIP LOCKED so
  // concurrent scheduler instances never claim the same rows.
  const claimed = await prisma.$queryRaw<{ id: string; priority: string }[]>`
    UPDATE notifications
    SET    status = 'QUEUED', updated_at = NOW()
    WHERE  id IN (
      SELECT id FROM notifications
      WHERE  status = 'SCHEDULED'
        AND  send_at <= ${now}
      ORDER  BY priority DESC, send_at ASC
      LIMIT  ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, priority
  `;

  if (claimed.length === 0) return 0;

  console.log(`[Scheduler] Claimed ${claimed.length} scheduled notifications`);

  // Enqueue each notification (queue calls are cheap fire-and-forget)
  const enqueueResults = await Promise.allSettled(
    claimed.map((n) =>
      addNotificationToQueue(n.id, n.priority as "LOW" | "NORMAL" | "HIGH"),
    ),
  );

  const failures = enqueueResults.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(
      `[Scheduler] ${failures.length}/${claimed.length} notifications failed to enqueue`,
    );
  }

  return claimed.length;
}

/**
 * Recover notifications stuck in QUEUED state with no delivery rows.
 * This can happen when notifications were marked QUEUED while queueing was disabled.
 */
async function recoverStaleQueuedNotifications(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_QUEUED_RECOVERY_MS);

  const claimed = await prisma.$queryRaw<{ id: string; priority: string }[]>`
    UPDATE notifications
    SET    updated_at = NOW(), send_at = ${now}
    WHERE  id IN (
      SELECT n.id
      FROM notifications n
      WHERE n.status = 'QUEUED'
        AND n.send_at <= ${now}
        AND n.updated_at <= ${cutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM notification_deliveries d
          WHERE d.notification_id = n.id
        )
      ORDER BY n.updated_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, priority
  `;

  if (claimed.length === 0) return 0;

  console.warn(
    `[Scheduler] Recovering ${claimed.length} stale QUEUED notifications with no deliveries`,
  );

  const enqueueResults = await Promise.allSettled(
    claimed.map((n) =>
      addNotificationToQueue(n.id, n.priority as "LOW" | "NORMAL" | "HIGH"),
    ),
  );

  const failures = enqueueResults.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(
      `[Scheduler] ${failures.length}/${claimed.length} stale notifications failed to enqueue`,
    );
  }

  return claimed.length;
}

/**
 * Process scheduled campaigns (bulk notifications)
 * Uses a Prisma transaction to atomically claim campaigns (SCHEDULED → PROCESSING)
 * before creating notifications, avoiding double-processing across instances.
 */
async function processScheduledCampaigns(): Promise<number> {
  const now = new Date();

  // Find campaigns that are SCHEDULED and ready to start
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    take: 10,
  });

  if (campaigns.length === 0) return 0;

  console.log(
    `[Scheduler] Found ${campaigns.length} scheduled campaigns ready to process`,
  );

  for (const campaign of campaigns) {
    try {
      // Atomically claim: only update if still SCHEDULED (prevents double-process)
      const claimed = await prisma.campaign.updateMany({
        where: { id: campaign.id, status: "SCHEDULED" },
        data: { status: "PROCESSING", startedAt: now },
      });

      if (claimed.count === 0) {
        // Another instance already claimed this campaign
        console.log(
          `[Scheduler] Campaign ${campaign.id} already claimed, skipping`,
        );
        continue;
      }

      // Offload campaign explosion to a dedicated BullMQ job
      // This keeps the scheduler tick lightweight — heavy iteration
      // of users + notification creation happens in the worker.
      await addCampaignExplosionJob(
        campaign.id,
        campaign.priority as "LOW" | "NORMAL" | "HIGH",
      );

      console.log(
        `[Scheduler] Campaign ${campaign.id} enqueued for explosion processing`,
      );
    } catch (error) {
      console.error(
        `[Scheduler] Failed to process campaign ${campaign.id}:`,
        error,
      );

      await prisma.campaign
        .updateMany({
          where: { id: campaign.id, status: "PROCESSING" },
          data: { status: "CANCELLED" },
        })
        .catch(() => {});
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
      status: "ACTIVE",
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
      // Atomically claim: only update if still ACTIVE + not started
      const claimed = await prisma.aBTest.updateMany({
        where: { id: test.id, status: "ACTIVE", startedAt: null },
        data: { startedAt: now },
      });

      if (claimed.count === 0) {
        console.log(
          `[Scheduler] A/B test ${test.id} already claimed, skipping`,
        );
        continue;
      }

      // Assign users to variants using deterministic hashing.
      // Process in batched pages to avoid N+1 queries.
      const variants = test.variants;
      const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
      const configuredIds = Array.isArray(test.targetUserIds)
        ? test.targetUserIds.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
        : [];
      const targetAudienceSize =
        test.targetingMode === "ALL"
          ? await prisma.user.count({
              where: { appId: test.appId, deletedAt: null },
            })
          : configuredIds.length;
      const strategy = chooseABTestFanoutStrategy(targetAudienceSize);
      const PAGE_SIZE = Math.max(100, strategy.pageSize);
      let processedCount = 0;

      /**
       * Assign a single external user ID to a variant deterministically.
       */
      const assignVariant = (externalUserId: string) => {
        const hash = simpleHash(`${test.id}:${externalUserId}`);
        const normalizedHash = hash % totalWeight;
        let cumulativeWeight = 0;
        for (const variant of variants) {
          cumulativeWeight += variant.weight;
          if (normalizedHash < cumulativeWeight) return variant;
        }
        return variants[0]!;
      };

      /**
       * Process a page of external user IDs: resolve internal IDs in
       * a single query, batch-upsert assignments, and batch-create
       * notifications grouped by variant.
       */
      const processPage = async (externalIds: string[]) => {
        // Batch-resolve internal user IDs (one query per page)
        const users = await prisma.user.findMany({
          where: {
            appId: test.appId,
            externalUserId: { in: externalIds },
            deletedAt: null,
          },
          select: { id: true, externalUserId: true },
        });

        // Group by assigned variant
        const byVariant = new Map<
          string,
          { userId: string; externalUserId: string }[]
        >();
        for (const user of users) {
          const variant = assignVariant(user.externalUserId);
          if (!byVariant.has(variant.id)) byVariant.set(variant.id, []);
          byVariant
            .get(variant.id)!
            .push({ userId: user.id, externalUserId: user.externalUserId });
        }

        for (const [variantId, variantUsers] of byVariant) {
          const variant = variants.find((v) => v.id === variantId)!;

          // Batch upsert assignments (use createMany + skipDuplicates as
          // a practical substitute for bulk upsert)
          await prisma.aBTestAssignment.createMany({
            data: variantUsers.map((u) => ({
              testId: test.id,
              userId: u.userId,
              variantId,
            })),
            skipDuplicates: true,
          });

          // Create one notification per variant batch (not per-user)
          const notification = await prisma.notification.create({
            data: {
              appId: test.appId,
              type: "campaign",
              status: "QUEUED",
              variantId,
              payload: {
                userIds: variantUsers.map((u) => u.externalUserId),
                adhocContent: {
                  title: variant.title,
                  subtitle: variant.subtitle,
                  body: variant.body,
                  image: variant.image,
                  data: {
                    abTestId: test.id,
                    abPhase: "LIVE",
                    abVariant: variant.name,
                  },
                },
              },
              priority: "NORMAL",
              sendAt: now,
              createdBy: test.createdBy,
            },
          });

          await addNotificationToQueue(notification.id, "NORMAL");
        }

        processedCount += users.length;
      };

      // Retrieve user IDs and process using adaptive fanout strategy.
      if (strategy.mode === "direct") {
        if (test.targetingMode === "ALL") {
          const users = await prisma.user.findMany({
            where: { appId: test.appId, deletedAt: null },
            select: { externalUserId: true },
            orderBy: { externalUserId: "asc" },
          });
          await processPage(users.map((u) => u.externalUserId));
        } else {
          await processPage(configuredIds);
        }
      } else {
        if (test.targetingMode === "ALL") {
          let cursor: string | undefined;
          let hasMore = true;
          while (hasMore) {
            const users = await prisma.user.findMany({
              where: { appId: test.appId, deletedAt: null },
              select: { externalUserId: true, id: true },
              take: PAGE_SIZE,
              orderBy: { id: "asc" },
              ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            });
            if (users.length === 0) break;
            hasMore = users.length === PAGE_SIZE;
            cursor = users[users.length - 1]!.id;
            await processPage(users.map((u) => u.externalUserId));
          }
        } else {
          for (let i = 0; i < configuredIds.length; i += PAGE_SIZE) {
            await processPage(configuredIds.slice(i, i + PAGE_SIZE));
          }
        }
      }

      // Mark test as completed
      await prisma.aBTest.update({
        where: { id: test.id },
        data: {
          completedAt: new Date(),
          status: "COMPLETED",
        },
      });

      console.log(
        `[Scheduler] A/B test ${test.id} processed: ${processedCount} users (strategy=${strategy.mode}, pageSize=${PAGE_SIZE})`,
      );
    } catch (error) {
      console.error(
        `[Scheduler] Failed to process A/B test ${test.id}:`,
        error,
      );

      // Revert to ACTIVE so it can be retried
      await prisma.aBTest
        .updateMany({
          where: { id: test.id, status: "ACTIVE" },
          data: { startedAt: null },
        })
        .catch(() => {});
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
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Clean up expired idempotency keys to prevent unbounded table growth.
 * Runs periodically as part of the scheduler tick.
 */
async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  try {
    const result = await prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    if (result.count > 0) {
      console.log(
        `[Scheduler] Cleaned up ${result.count} expired idempotency keys`,
      );
    }
    return result.count;
  } catch (error) {
    console.error("[Scheduler] Failed to clean up idempotency keys:", error);
    return 0;
  }
}

/**
 * Clean up expired suppressions.
 */
async function cleanupExpiredSuppressions(): Promise<number> {
  try {
    const result = await prisma.suppression.deleteMany({
      where: {
        expiresAt: { lt: new Date(), not: null },
      },
    });
    if (result.count > 0) {
      console.log(
        `[Scheduler] Cleaned up ${result.count} expired suppressions`,
      );
    }
    return result.count;
  } catch (error) {
    console.error("[Scheduler] Failed to clean up suppressions:", error);
    return 0;
  }
}

/**
 * Process automation executions that are ready to resume (after delay steps).
 */
async function processDueAutomationExecutions(): Promise<number> {
  const now = new Date();

  const dueExecutions = await prisma.automationExecution.findMany({
    where: {
      status: "IN_PROGRESS",
      resumeAt: { lte: now },
    },
    select: { id: true },
    orderBy: { resumeAt: "asc" },
    take: BATCH_SIZE,
  });

  if (dueExecutions.length === 0) {
    return 0;
  }

  const executionResults = await Promise.allSettled(
    dueExecutions.map((execution) => processExecution(execution.id)),
  );
  const failures = executionResults.filter(
    (result) => result.status === "rejected",
  );

  if (failures.length > 0) {
    console.error(
      `[Scheduler] ${failures.length}/${dueExecutions.length} automation executions failed to process`,
    );
  }

  return dueExecutions.length;
}

/**
 * Main scheduler tick — acquires distributed lock before processing.
 */
async function tick(): Promise<void> {
  if (!isRunning) return;

  // In-process overlap guard
  if (tickInProgress) {
    console.log("[Scheduler] Previous tick still in progress, skipping");
    return;
  }

  tickInProgress = true;

  // Acquire distributed lock (Redis SET NX)
  const release = await acquireLock();
  if (!release) {
    tickInProgress = false;
    // Another instance holds the lock — silently skip
    return;
  }

  try {
    const [notifCount, recoveredQueuedCount, campaignCount, testCount, automationCount] =
      await Promise.all([
      processScheduledNotifications(),
      recoverStaleQueuedNotifications(),
      processScheduledCampaigns(),
      processScheduledABTests(),
      processDueAutomationExecutions(),
    ]);

    // Periodic cleanup tasks (non-blocking — errors don't fail the tick)
    await Promise.all([
      cleanupExpiredIdempotencyKeys(),
      cleanupExpiredSuppressions(),
    ]).catch(() => {});

    if (
      notifCount > 0 ||
      recoveredQueuedCount > 0 ||
      campaignCount > 0 ||
      testCount > 0 ||
      automationCount > 0
    ) {
      console.log(
        `[Scheduler] Tick complete: ${notifCount} scheduled notifications, ` +
          `${recoveredQueuedCount} recovered queued notifications, ` +
          `${campaignCount} campaigns, ${testCount} A/B tests, ` +
          `${automationCount} automation executions`,
      );
    }
  } catch (error) {
    console.error("[Scheduler] Tick failed:", error);
  } finally {
    await release();
    tickInProgress = false;
  }
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  if (isRunning) {
    console.log("[Scheduler] Already running");
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

  console.log("[Scheduler] Stopped");
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return isRunning;
}
