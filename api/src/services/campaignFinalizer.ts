/**
 * Campaign Finalizer
 *
 * Bridges the gap between per-notification delivery completion and the parent
 * Campaign lifecycle. A campaign is exploded into many Notifications (each
 * targeting a batch of users); those notifications finalize independently in
 * the delivery worker. Nothing previously rolled that completion back up to the
 * Campaign, so campaigns stayed stuck in SENDING forever and their denormalized
 * stat counters (sentCount/deliveredCount/failedCount) were never populated.
 *
 * This module is the single source of truth for:
 *   - computing campaign-level delivery counts from NotificationDelivery rows
 *   - transitioning a campaign SENDING/PROCESSING -> COMPLETED once every one of
 *     its notifications has reached a terminal state.
 *
 * It is called both event-driven (from the worker when a notification
 * finalizes) and as a periodic reconciliation sweep (from the scheduler), so a
 * crashed/missed event self-heals on the next tick.
 */

import { prisma } from "./database";
import { invalidateCache } from "../middleware/cacheMiddleware";

// Delivery row statuses written by the delivery worker (see workers/notification.ts).
const DELIVERY_DELIVERED = "DELIVERED";
const DELIVERY_FAILED = "FAILED";

export interface CampaignDeliveryCounts {
  /** Successfully handed to the push provider. */
  sent: number;
  /** Same as `sent` here — the system only knows provider acceptance, not on-device receipt. */
  delivered: number;
  /** Terminal failures. */
  failed: number;
  /** Raw count per delivery status (PENDING, RETRY, DELIVERED, FAILED, ...). */
  breakdown: Record<string, number>;
}

/**
 * Collapse a NotificationDelivery `groupBy(status)` result into campaign-level
 * counts. Pure function so it can be reused by the stats endpoint without
 * re-querying.
 */
export function mapDeliveryBreakdown(
  rows: Array<{ status: string; count: number }>,
): CampaignDeliveryCounts {
  const breakdown: Record<string, number> = {};
  for (const row of rows) breakdown[row.status] = row.count;
  const delivered = breakdown[DELIVERY_DELIVERED] || 0;
  const failed = breakdown[DELIVERY_FAILED] || 0;
  return { sent: delivered, delivered, failed, breakdown };
}

/**
 * Aggregate live delivery outcomes for a campaign straight from the source of
 * truth (NotificationDelivery rows). Fetches notification ids first to keep the
 * groupBy on an indexed scalar `notificationId` filter.
 */
export async function getCampaignDeliveryCounts(
  campaignId: string,
): Promise<CampaignDeliveryCounts> {
  const notifications = await prisma.notification.findMany({
    where: { campaignId },
    select: { id: true },
  });
  const notificationIds = notifications.map((n) => n.id);
  if (notificationIds.length === 0) {
    return { sent: 0, delivered: 0, failed: 0, breakdown: {} };
  }

  const rows = await prisma.notificationDelivery.groupBy({
    by: ["status"],
    where: { notificationId: { in: notificationIds } },
    _count: true,
  });

  return mapDeliveryBreakdown(
    rows.map((r) => ({ status: r.status, count: r._count as unknown as number })),
  );
}

/**
 * Transition a campaign to COMPLETED if (and only if) every one of its
 * notifications has left the QUEUED state. Writes the final delivery counters
 * and invalidates the cached stats. Idempotent and concurrency-safe: the
 * terminal `updateMany` only matches a campaign still in SENDING/PROCESSING, so
 * simultaneous callers can't double-complete.
 *
 * @returns true if this call transitioned the campaign to COMPLETED.
 */
export async function finalizeCampaignIfComplete(
  campaignId: string,
): Promise<boolean> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true },
  });

  // Only finalize campaigns in SENDING. SENDING is set by the explosion worker
  // ONLY after every notification has been created and enqueued, so checking
  // "no notifications left QUEUED" is meaningful. While still PROCESSING the
  // explosion may not have created all notifications yet — finalizing then
  // would race the explosion and could mark the campaign COMPLETED prematurely.
  if (!campaign || campaign.status !== "SENDING") {
    return false;
  }

  // Status is SENDING, so the explosion worker has finished creating every
  // notification. The campaign is done once none are left QUEUED. (A campaign
  // that targeted zero users has zero notifications and completes immediately.)
  const pendingNotifications = await prisma.notification.count({
    where: { campaignId, status: "QUEUED" },
  });
  if (pendingNotifications > 0) return false;

  const counts = await getCampaignDeliveryCounts(campaignId);

  const updated = await prisma.campaign.updateMany({
    where: { id: campaignId, status: "SENDING" },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      sentCount: counts.sent,
      deliveredCount: counts.delivered,
      failedCount: counts.failed,
    },
  });

  if (updated.count > 0) {
    await invalidateCache(`/campaigns/${campaignId}/stats`).catch(() => {});
    return true;
  }
  return false;
}

/**
 * Reconciliation sweep: find campaigns stuck in SENDING and finalize any whose
 * notifications have all completed. Self-heals campaigns missed by the
 * event-driven path (e.g. a worker crash between finalizing the last
 * notification and updating the campaign).
 *
 * @returns the number of campaigns transitioned to COMPLETED this sweep.
 */
export async function reconcileSendingCampaigns(limit = 100): Promise<number> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "SENDING" },
    select: { id: true },
    take: limit,
  });

  let completed = 0;
  for (const campaign of campaigns) {
    try {
      if (await finalizeCampaignIfComplete(campaign.id)) completed++;
    } catch (error) {
      console.error(
        `[CampaignFinalizer] Failed to reconcile campaign ${campaign.id}:`,
        error,
      );
    }
  }
  return completed;
}
