/**
 * Dead Letter Queue Service
 * Handles permanently failed notifications for manual review
 */

import { prisma } from "./database";
import type { PushResult, ProviderType } from "./push-providers";

export interface DeadLetterEntry {
  notificationId?: string;
  deliveryId?: string;
  provider: ProviderType;
  payload: {
    deviceId?: string;
    title?: string;
    body?: string;
    dataKeys?: string[];
  };
  errorMessage: string;
  errorCode?: string;
  attempts: number;
}

/**
 * Add a failed notification to the dead letter queue
 */
export async function addToDeadLetterQueue(
  entry: DeadLetterEntry,
): Promise<void> {
  try {
    await prisma.deadLetterQueue.create({
      data: {
        notificationId: entry.notificationId,
        deliveryId: entry.deliveryId,
        provider: entry.provider,
        payload: entry.payload as any,
        errorMessage: entry.errorMessage,
        errorCode: entry.errorCode,
        attempts: entry.attempts,
      },
    });

    console.error(
      `[DLQ] Added failed delivery: ${entry.deliveryId || entry.notificationId} provider=${entry.provider} attempts=${entry.attempts} errorCode=${entry.errorCode || "UNKNOWN"} error=${entry.errorMessage}`,
    );

    // Check if we need to alert
    await checkAlertThreshold();
  } catch (error) {
    console.error("[DLQ] Failed to add entry:", error);
  }
}

/**
 * Check if DLQ size exceeds alert threshold
 */
async function checkAlertThreshold(): Promise<void> {
  const threshold = parseInt(process.env.DLQ_ALERT_THRESHOLD || "100");

  const count = await prisma.deadLetterQueue.count({
    where: { processedAt: null },
  });

  if (count >= threshold) {
    console.warn(
      `[DLQ] ALERT: ${count} unprocessed entries (threshold: ${threshold})`,
    );
    // TODO: Send alert to monitoring system (Slack, PagerDuty, etc.)
  }
}

/**
 * Get unprocessed DLQ entries for manual review
 */
export async function getDeadLetterEntries(options: {
  limit?: number;
  offset?: number;
  provider?: string;
}): Promise<{ entries: any[]; total: number }> {
  const where = {
    processedAt: null,
    ...(options.provider && { provider: options.provider }),
  };

  const [entries, total] = await Promise.all([
    prisma.deadLetterQueue.findMany({
      where,
      take: options.limit || 50,
      skip: options.offset || 0,
      orderBy: { createdAt: "desc" },
    }),
    prisma.deadLetterQueue.count({ where }),
  ]);

  return { entries, total };
}

/**
 * Mark DLQ entries as processed
 */
export async function markAsProcessed(ids: string[]): Promise<number> {
  const result = await prisma.deadLetterQueue.updateMany({
    where: { id: { in: ids } },
    data: { processedAt: new Date() },
  });

  return result.count;
}

/**
 * Retry a DLQ entry (moves it back to the queue)
 */
export async function retryDeadLetterEntry(id: string): Promise<boolean> {
  const entry = await prisma.deadLetterQueue.findUnique({
    where: { id },
  });

  if (!entry || entry.processedAt) {
    return false;
  }

  // Re-queue the notification
  const { addNotificationToQueue } = await import("./queue");

  if (entry.notificationId) {
    await addNotificationToQueue(entry.notificationId, "NORMAL");
  }

  // Mark as processed
  await prisma.deadLetterQueue.update({
    where: { id },
    data: { processedAt: new Date() },
  });

  return true;
}

/**
 * Get DLQ statistics
 */
export async function getDeadLetterStats(): Promise<{
  total: number;
  byProvider: Record<string, number>;
  byErrorCode: Record<string, number>;
  last24Hours: number;
}> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total, last24Hours, byProvider, byErrorCode] = await Promise.all([
    prisma.deadLetterQueue.count({ where: { processedAt: null } }),
    prisma.deadLetterQueue.count({
      where: {
        processedAt: null,
        createdAt: { gte: oneDayAgo },
      },
    }),
    prisma.deadLetterQueue.groupBy({
      by: ["provider"],
      where: { processedAt: null },
      _count: true,
    }),
    prisma.deadLetterQueue.groupBy({
      by: ["errorCode"],
      where: { processedAt: null },
      _count: true,
    }),
  ]);

  return {
    total,
    last24Hours,
    byProvider: Object.fromEntries(
      byProvider.map((p) => [p.provider, p._count]),
    ),
    byErrorCode: Object.fromEntries(
      byErrorCode
        .filter((e) => e.errorCode)
        .map((e) => [e.errorCode!, e._count]),
    ),
  };
}
