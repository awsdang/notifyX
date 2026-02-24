/**
 * Campaign Explosion Worker
 * Handles the heavy lifting of expanding campaigns into per-batch notifications.
 * This runs as a BullMQ job processor, keeping the scheduler tick lightweight.
 */

import { prisma } from "../services/database";
import { addNotificationToQueue } from "../services/queue";
import type { Priority } from "../services/queue";
import { parseCampaignTargetingData } from "../utils/campaignTargeting";

const NOTIFICATION_BATCH_SIZE = 500;

/**
 * Process a single campaign explosion job.
 * Reads the campaign, iterates users in pages, creates notifications in batches,
 * and enqueues them for per-device delivery.
 */
export async function processCampaignExplosion(
  campaignId: string,
): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign || campaign.status !== "PROCESSING") {
    console.log(
      `[CampaignExplosion] Campaign ${campaignId} not in PROCESSING state, skipping`,
    );
    return;
  }

  const now = new Date();
  const priority = campaign.priority as Priority;
  const targeting = parseCampaignTargetingData(campaign.targetUserIds);

  try {
    if (campaign.targetingMode === "ALL") {
      // Count first so we can set totalTargets early
      const totalTargets = await prisma.user.count({
        where: { appId: campaign.appId, deletedAt: null },
      });
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { totalTargets },
      });

      // Cursor-based pagination — never hold more than PAGE_SIZE IDs in memory
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const users = await prisma.user.findMany({
          where: { appId: campaign.appId, deletedAt: null },
          select: { id: true, externalUserId: true },
          take: NOTIFICATION_BATCH_SIZE,
          orderBy: { id: "asc" },
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });

        if (users.length === 0) break;
        hasMore = users.length === NOTIFICATION_BATCH_SIZE;
        cursor = users[users.length - 1]!.id;

        const batch = users.map((u) => u.externalUserId);
        await createBatchNotification(campaign, batch, now, priority, targeting);
      }
    } else {
      // USER_LIST or CSV — userIds stored in campaign record
      const userIds = targeting.userIds;

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { totalTargets: userIds.length },
      });

      for (let i = 0; i < userIds.length; i += NOTIFICATION_BATCH_SIZE) {
        const batch = userIds.slice(i, i + NOTIFICATION_BATCH_SIZE);
        await createBatchNotification(campaign, batch, now, priority, targeting);
      }
    }

    // Mark campaign as SENDING (deliveries are still in-flight)
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "SENDING" as any },
    });

    console.log(`[CampaignExplosion] Campaign ${campaign.id} fully enqueued`);
  } catch (error) {
    console.error(
      `[CampaignExplosion] Failed to process campaign ${campaignId}:`,
      error,
    );

    // Revert to CANCELLED on failure
    await prisma.campaign
      .updateMany({
        where: { id: campaign.id, status: "PROCESSING" },
        data: { status: "CANCELLED" },
      })
      .catch(() => {});

    throw error; // Let BullMQ handle retries
  }
}

async function createBatchNotification(
  campaign: any,
  batch: string[],
  now: Date,
  priority: Priority,
  targeting: ReturnType<typeof parseCampaignTargetingData>,
): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      appId: campaign.appId,
      type: "campaign",
      status: "QUEUED",
      campaignId: campaign.id,
      payload: {
        userIds: batch,
        platforms: targeting.platforms,
        adhocContent: {
          title: campaign.title,
          subtitle: campaign.subtitle,
          body: campaign.body,
          image: campaign.image,
          actionUrl: targeting.actionUrl,
          actions: targeting.actions,
          data: targeting.data,
        },
      } as any,
      priority,
      sendAt: now,
      createdBy: campaign.createdBy,
    },
  });

  await addNotificationToQueue(notification.id, priority);

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { processedCount: { increment: batch.length } },
  });
}
