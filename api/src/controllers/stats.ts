/**
 * Statistics Controller
 * Dashboard and analytics endpoints for admin portal
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import { sendSuccess } from "../utils/response";

function scopedAppIds(req: Request): string[] | null {
  if (req.accessibleAppIds === null || req.accessibleAppIds === undefined) {
    return null;
  }
  return req.accessibleAppIds;
}

/**
 * Get dashboard overview stats
 */
export const getDashboardStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const appIds = scopedAppIds(req);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const notificationScope = appIds ? { appId: { in: appIds } } : {};
    const deliveryScope = appIds
      ? { notification: { appId: { in: appIds } } }
      : {};

    const [
      totalNotifications,
      todayNotifications,
      weekNotifications,
      monthNotifications,
      pendingNotifications,
      failedNotifications,
      delivered,
      failedDel,
      totalApps,
      totalUsers,
      totalDevices,
      totalTemplates,
    ] = await Promise.all([
      prisma.notification.count({ where: notificationScope }),
      prisma.notification.count({
        where: { ...notificationScope, createdAt: { gte: today } },
      }),
      prisma.notification.count({
        where: { ...notificationScope, createdAt: { gte: thisWeek } },
      }),
      prisma.notification.count({
        where: { ...notificationScope, createdAt: { gte: thisMonth } },
      }),
      prisma.notification.count({
        where: { ...notificationScope, status: "PENDING" },
      }),
      prisma.notification.count({
        where: { ...notificationScope, status: "FAILED" },
      }),
      prisma.notificationDelivery.count({
        where: { ...deliveryScope, status: "DELIVERED" },
      }),
      prisma.notificationDelivery.count({
        where: { ...deliveryScope, status: "FAILED" },
      }),
      prisma.app.count({ where: appIds ? { id: { in: appIds } } : {} }),
      prisma.user.count({
        where: {
          deletedAt: null,
          ...(appIds ? { appId: { in: appIds } } : {}),
        },
      }),
      prisma.device.count({
        where: {
          isActive: true,
          ...(appIds ? { user: { appId: { in: appIds } } } : {}),
        },
      }),
      prisma.notificationTemplate.count({
        where: appIds ? { appId: { in: appIds } } : {},
      }),
    ]);

    const totalDeliveries = delivered + failedDel;
    const deliveryRate =
      totalDeliveries > 0 ? Math.round((delivered / totalDeliveries) * 100) : 0;

    const stats = [
      {
        title: "Total Notifications",
        value: totalNotifications.toString(),
        unit: null,
      },
      {
        title: "Today Notifications",
        value: todayNotifications.toString(),
        unit: null,
      },
      {
        title: "Weekly Notifications",
        value: weekNotifications.toString(),
        unit: null,
      },
      {
        title: "Monthly Notifications",
        value: monthNotifications.toString(),
        unit: null,
      },
      {
        title: "Pending Notifications",
        value: pendingNotifications.toString(),
        unit: null,
      },
      {
        title: "Failed Notifications",
        value: failedNotifications.toString(),
        unit: null,
      },
      { title: "Delivery Rate", value: deliveryRate.toString(), unit: "%" },
      { title: "Total Apps", value: totalApps.toString(), unit: null },
      { title: "Total Users", value: totalUsers.toString(), unit: null },
      { title: "Active Devices", value: totalDevices.toString(), unit: null },
      {
        title: "Total Templates",
        value: totalTemplates.toString(),
        unit: null,
      },
    ];

    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
};

/**
 * Get notification stats by app
 */
export const getAppStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const appIds = scopedAppIds(req);
    const apps = await prisma.app.findMany({
      where: appIds ? { id: { in: appIds } } : undefined,
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            notifications: true,
            users: true,
            templates: true,
          },
        },
      },
    });

    const stats: any[] = [];
    apps.forEach((app) => {
      stats.push({
        title: `${app.name} Notifications`,
        value: app._count.notifications.toString(),
        unit: null,
      });
      stats.push({
        title: `${app.name} Users`,
        value: app._count.users.toString(),
        unit: null,
      });
      stats.push({
        title: `${app.name} Templates`,
        value: app._count.templates.toString(),
        unit: null,
      });
    });

    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
};

/**
 * Get notification stats over time (last 30 days)
 */
export const getNotificationTrend = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const appIds = scopedAppIds(req);
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Scope-safe aggregation in app memory (bounded by days window)
    const notifications = await prisma.notification.findMany({
      where: {
        createdAt: { gte: startDate },
        ...(appIds ? { appId: { in: appIds } } : {}),
      },
      select: { createdAt: true, status: true },
    });

    // Build date map with defaults
    const byDate: Record<
      string,
      { total: number; delivered: number; failed: number }
    > = {};

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split("T")[0]!;
      byDate[key] = { total: 0, delivered: 0, failed: 0 };
    }

    // Fill from scoped results
    for (const row of notifications) {
      const key = row.createdAt.toISOString().split("T")[0]!;
      if (!byDate[key]) continue;
      byDate[key]!.total += 1;
      if (row.status === "DELIVERED") byDate[key]!.delivered += 1;
      if (row.status === "FAILED") byDate[key]!.failed += 1;
    }

    const stats = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([date, s]) => [
        { title: `${date} Total`, value: s.total.toString(), unit: null },
        {
          title: `${date} Delivered`,
          value: s.delivered.toString(),
          unit: null,
        },
        { title: `${date} Failed`, value: s.failed.toString(), unit: null },
      ]);

    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
};

/**
 * Get delivery stats by provider
 */
export const getProviderStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const appIds = scopedAppIds(req);
    const deliveries = await prisma.notificationDelivery.groupBy({
      where: appIds ? { notification: { appId: { in: appIds } } } : undefined,
      by: ["provider", "status"],
      _count: { id: true },
    });

    // Aggregate by provider
    const byProvider: Record<
      string,
      { total: number; delivered: number; failed: number; pending: number }
    > = {};

    deliveries.forEach((d) => {
      if (!byProvider[d.provider]) {
        byProvider[d.provider] = {
          total: 0,
          delivered: 0,
          failed: 0,
          pending: 0,
        };
      }
      const providerStats = byProvider[d.provider]!;
      providerStats.total += d._count.id;
      if (d.status === "DELIVERED") providerStats.delivered += d._count.id;
      if (d.status === "FAILED") providerStats.failed += d._count.id;
      if (d.status === "PENDING") providerStats.pending += d._count.id;
    });

    const stats = Object.entries(byProvider).flatMap(([provider, counts]) => {
      const successRate =
        counts.total > 0
          ? Math.round(
              (counts.delivered / (counts.delivered + counts.failed)) * 100,
            ) || 0
          : 0;

      return [
        {
          title: `${provider} Total`,
          value: counts.total.toString(),
          unit: null,
        },
        {
          title: `${provider} Success Rate`,
          value: successRate.toString(),
          unit: "%",
        },
      ];
    });

    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
};
