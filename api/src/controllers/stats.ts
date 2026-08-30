/**
 * Statistics Controller
 * Dashboard and analytics endpoints for admin portal
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import { sendSuccess, AppError } from "../utils/response";
import { canAccessAppId } from "../middleware/tenantScope";

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

/**
 * Dashboard overview — one structured payload instead of the flat
 * `{ title, value }` string list the portal used to re-parse by name.
 *
 * Optional `?appId=` narrows everything to a single app (the portal's app
 * switcher); without it the numbers cover every app the caller can reach.
 * `?days=` controls the trend/window used for the period comparison.
 */
export const getDashboardOverview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const scoped = scopedAppIds(req);
    const requestedAppId =
      typeof req.query.appId === "string" && req.query.appId
        ? req.query.appId
        : null;

    if (requestedAppId && !canAccessAppId(req, requestedAppId)) {
      throw new AppError(403, "You do not have access to this app", "FORBIDDEN");
    }

    const appIds = requestedAppId ? [requestedAppId] : scoped;
    const appFilter = appIds ? { appId: { in: appIds } } : {};
    const deliveryFilter = appIds
      ? { notification: { appId: { in: appIds } } }
      : {};

    const days = Math.min(90, Math.max(7, parseInt(req.query.days as string, 10) || 14));
    const now = new Date();
    const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    // Same-length window immediately before, for the period-over-period delta.
    const previousStart = new Date(windowStart.getTime() - days * 24 * 60 * 60 * 1000);

    const [
      statusGroups,
      windowCount,
      previousCount,
      providerGroups,
      failureGroups,
      trendRows,
      appRows,
      deviceGroups,
      totalUsers,
      reachableUsers,
      recentNotifications,
    ] = await Promise.all([
      prisma.notification.groupBy({
        by: ["status"],
        where: appFilter,
        _count: { _all: true },
      }),
      prisma.notification.count({
        where: { ...appFilter, createdAt: { gte: windowStart } },
      }),
      prisma.notification.count({
        where: {
          ...appFilter,
          createdAt: { gte: previousStart, lt: windowStart },
        },
      }),
      prisma.notificationDelivery.groupBy({
        by: ["provider", "status"],
        where: deliveryFilter,
        _count: { _all: true },
      }),
      prisma.notificationDelivery.groupBy({
        by: ["failureCategory"],
        where: { ...deliveryFilter, status: "FAILED" },
        _count: { _all: true },
      }),
      prisma.notification.findMany({
        where: { ...appFilter, createdAt: { gte: windowStart } },
        select: { createdAt: true, status: true },
      }),
      prisma.app.findMany({
        where: appIds ? { id: { in: appIds } } : {},
        select: {
          id: true,
          name: true,
          isKilled: true,
          notificationIconUrl: true,
          _count: { select: { notifications: true, users: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.device.groupBy({
        by: ["platform"],
        where: {
          isActive: true,
          tokenInvalidAt: null,
          ...(appIds ? { user: { appId: { in: appIds } } } : {}),
        },
        _count: { _all: true },
      }),
      prisma.user.count({
        where: { deletedAt: null, ...(appIds ? { appId: { in: appIds } } : {}) },
      }),
      prisma.user.count({
        where: {
          deletedAt: null,
          ...(appIds ? { appId: { in: appIds } } : {}),
          devices: { some: { isActive: true, tokenInvalidAt: null } },
        },
      }),
      prisma.notification.findMany({
        where: appFilter,
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          type: true,
          status: true,
          payload: true,
          createdAt: true,
          app: { select: { id: true, name: true } },
        },
      }),
    ]);

    const statusCount = (status: string) =>
      statusGroups.find((g) => g.status === status)?._count._all ?? 0;

    const totalNotifications = statusGroups.reduce(
      (sum, g) => sum + g._count._all,
      0,
    );

    // Delivery funnel from the per-device delivery rows (a single notification
    // fans out to many devices, so these are not the same as the counts above).
    let attempted = 0;
    let delivered = 0;
    let failed = 0;
    const providers: Record<
      string,
      { provider: string; attempted: number; delivered: number; failed: number }
    > = {};

    for (const row of providerGroups) {
      const count = row._count._all;
      if (!providers[row.provider]) {
        providers[row.provider] = {
          provider: row.provider,
          attempted: 0,
          delivered: 0,
          failed: 0,
        };
      }
      const bucket = providers[row.provider]!;
      if (row.status === "DID_NOT_TRY") continue;
      bucket.attempted += count;
      attempted += count;
      if (row.status === "DELIVERED") {
        bucket.delivered += count;
        delivered += count;
      }
      if (row.status === "FAILED") {
        bucket.failed += count;
        failed += count;
      }
    }

    const rate = (part: number, whole: number) =>
      whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

    const byDate: Record<
      string,
      { date: string; total: number; delivered: number; failed: number }
    > = {};
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      byDate[key] = { date: key, total: 0, delivered: 0, failed: 0 };
    }
    for (const row of trendRows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      const bucket = byDate[key];
      if (!bucket) continue;
      bucket.total += 1;
      if (row.status === "DELIVERED") bucket.delivered += 1;
      if (row.status === "FAILED") bucket.failed += 1;
    }

    sendSuccess(res, {
      scope: {
        appId: requestedAppId,
        appCount: appRows.length,
        days,
      },
      notifications: {
        total: totalNotifications,
        pending: statusCount("PENDING"),
        processing: statusCount("PROCESSING"),
        sent: statusCount("SENT"),
        delivered: statusCount("DELIVERED"),
        failed: statusCount("FAILED"),
        cancelled: statusCount("CANCELLED"),
        inWindow: windowCount,
        inPreviousWindow: previousCount,
        changePct:
          previousCount > 0
            ? Math.round(((windowCount - previousCount) / previousCount) * 1000) / 10
            : null,
      },
      delivery: {
        attempted,
        delivered,
        failed,
        successRate: rate(delivered, delivered + failed),
        failureRate: rate(failed, delivered + failed),
      },
      providers: Object.values(providers)
        .map((p) => ({ ...p, successRate: rate(p.delivered, p.delivered + p.failed) }))
        .sort((a, b) => b.attempted - a.attempted),
      failures: failureGroups
        .map((g) => ({
          category: g.failureCategory || "UNKNOWN",
          count: g._count._all,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
      audience: {
        users: totalUsers,
        reachableUsers,
        reachablePct: rate(reachableUsers, totalUsers),
        devices: deviceGroups.reduce((sum, g) => sum + g._count._all, 0),
        byPlatform: deviceGroups
          .map((g) => ({ platform: g.platform, count: g._count._all }))
          .sort((a, b) => b.count - a.count),
      },
      trend: Object.values(byDate),
      apps: appRows.map((app) => ({
        id: app.id,
        name: app.name,
        isKilled: app.isKilled,
        iconUrl: app.notificationIconUrl,
        notifications: app._count.notifications,
        users: app._count.users,
      })),
      recentActivity: recentNotifications.map((n) => {
        // The human-readable title lives inside the payload blob.
        const payload = (n.payload ?? {}) as Record<string, any>;
        return {
          id: n.id,
          type: n.type,
          status: n.status,
          createdAt: n.createdAt,
          app: n.app,
          title:
            typeof payload.title === "string" && payload.title
              ? payload.title
              : "(no title)",
          body: typeof payload.body === "string" ? payload.body : null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};
