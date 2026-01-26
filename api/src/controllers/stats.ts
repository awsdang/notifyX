/**
 * Statistics Controller
 * Dashboard and analytics endpoints for admin portal
 */

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { sendSuccess } from '../utils/response';

/**
 * Get dashboard overview stats
 */
export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get counts in parallel
        const [
            totalNotifications,
            todayNotifications,
            weekNotifications,
            monthNotifications,
            pendingNotifications,
            failedNotifications,
            totalApps,
            totalUsers,
            totalDevices,
            totalTemplates,
        ] = await Promise.all([
            prisma.notification.count(),
            prisma.notification.count({ where: { createdAt: { gte: today } } }),
            prisma.notification.count({ where: { createdAt: { gte: thisWeek } } }),
            prisma.notification.count({ where: { createdAt: { gte: thisMonth } } }),
            prisma.notification.count({ where: { status: 'PENDING' } }),
            prisma.notification.count({ where: { status: 'FAILED' } }),
            prisma.app.count(),
            prisma.user.count({ where: { deletedAt: null } }),
            prisma.device.count({ where: { isActive: true } }),
            prisma.notificationTemplate.count(),
        ]);

        // Get delivery stats
        const [deliveredCount, failedDeliveries] = await Promise.all([
            prisma.notificationDelivery.count({ where: { status: 'DELIVERED' } }),
            prisma.notificationDelivery.count({ where: { status: 'FAILED' } }),
        ]);

        const totalDeliveries = deliveredCount + failedDeliveries;
        const deliveryRate = totalDeliveries > 0
            ? Math.round((deliveredCount / totalDeliveries) * 100)
            : 0;

        const stats = [
            { title: 'Total Notifications', value: totalNotifications.toString(), unit: null },
            { title: 'Today Notifications', value: todayNotifications.toString(), unit: null },
            { title: 'Weekly Notifications', value: weekNotifications.toString(), unit: null },
            { title: 'Monthly Notifications', value: monthNotifications.toString(), unit: null },
            { title: 'Pending Notifications', value: pendingNotifications.toString(), unit: null },
            { title: 'Failed Notifications', value: failedNotifications.toString(), unit: null },
            { title: 'Delivery Rate', value: deliveryRate.toString(), unit: '%' },
            { title: 'Total Apps', value: totalApps.toString(), unit: null },
            { title: 'Total Users', value: totalUsers.toString(), unit: null },
            { title: 'Active Devices', value: totalDevices.toString(), unit: null },
            { title: 'Total Templates', value: totalTemplates.toString(), unit: null },
        ];

        sendSuccess(res, stats);
    } catch (error) {
        next(error);
    }
};

/**
 * Get notification stats by app
 */
export const getAppStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const apps = await prisma.app.findMany({
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
        apps.forEach(app => {
            stats.push({ title: `${app.name} Notifications`, value: app._count.notifications.toString(), unit: null });
            stats.push({ title: `${app.name} Users`, value: app._count.users.toString(), unit: null });
            stats.push({ title: `${app.name} Templates`, value: app._count.templates.toString(), unit: null });
        });

        sendSuccess(res, stats);
    } catch (error) {
        next(error);
    }
};

/**
 * Get notification stats over time (last 30 days)
 */
export const getNotificationTrend = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const days = parseInt(req.query.days as string) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get notifications grouped by date
        const notifications = await prisma.notification.findMany({
            where: { createdAt: { gte: startDate } },
            select: { createdAt: true, status: true },
        });

        // Group by date
        const byDate: Record<string, { total: number; delivered: number; failed: number }> = {};

        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = date.toISOString().split('T')[0]!;
            byDate[key] = { total: 0, delivered: 0, failed: 0 };
        }

        notifications.forEach(n => {
            const key = n.createdAt.toISOString().split('T')[0]!;
            if (byDate[key]) {
                byDate[key]!.total++;
                if (n.status === 'DELIVERED') byDate[key]!.delivered++;
                if (n.status === 'FAILED') byDate[key]!.failed++;
            }
        });

        const stats = Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .flatMap(([date, s]) => [
                { title: `${date} Total`, value: s.total.toString(), unit: null },
                { title: `${date} Delivered`, value: s.delivered.toString(), unit: null },
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
export const getProviderStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const deliveries = await prisma.notificationDelivery.groupBy({
            by: ['provider', 'status'],
            _count: { id: true },
        });

        // Aggregate by provider
        const byProvider: Record<string, { total: number; delivered: number; failed: number; pending: number }> = {};

        deliveries.forEach(d => {
            if (!byProvider[d.provider]) {
                byProvider[d.provider] = { total: 0, delivered: 0, failed: 0, pending: 0 };
            }
            const providerStats = byProvider[d.provider]!;
            providerStats.total += d._count.id;
            if (d.status === 'DELIVERED') providerStats.delivered += d._count.id;
            if (d.status === 'FAILED') providerStats.failed += d._count.id;
            if (d.status === 'PENDING') providerStats.pending += d._count.id;
        });

        const stats = Object.entries(byProvider).flatMap(([provider, counts]) => {
            const successRate = counts.total > 0
                ? Math.round((counts.delivered / (counts.delivered + counts.failed)) * 100) || 0
                : 0;

            return [
                { title: `${provider} Total`, value: counts.total.toString(), unit: null },
                { title: `${provider} Success Rate`, value: successRate.toString(), unit: '%' },
            ];
        });

        sendSuccess(res, stats);
    } catch (error) {
        next(error);
    }
};
