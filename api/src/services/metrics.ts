/**
 * Metrics and Monitoring Service
 * Collects and exposes application metrics
 */

import { prisma } from './database';
import { getQueueHealth } from './queue';
import { checkRedisHealth } from './redis';
import type { Metrics } from '../interfaces/services/metrics';

const startTime = Date.now();

/**
 * Collect all metrics
 */
export async function collectMetrics(): Promise<Metrics> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
        notificationStats,
        deliveryStats,
        queueHealth,
        appCount,
        userCount,
        deviceStats,
        dlqCount,
        todayNotifications,
    ] = await Promise.all([
        // Notification stats
        prisma.notification.groupBy({
            by: ['status'],
            _count: true,
        }),
        // Delivery stats
        prisma.notificationDelivery.groupBy({
            by: ['status'],
            _count: true,
        }),
        // Queue health
        getQueueHealth(),
        // App count
        prisma.app.count(),
        // User count
        prisma.user.count({ where: { deletedAt: null } }),
        // Device stats
        Promise.all([
            prisma.device.count(),
            prisma.device.count({ where: { isActive: true, tokenInvalidAt: null } }),
        ]),
        // DLQ count
        prisma.deadLetterQueue.count({ where: { processedAt: null } }),
        // Today's notifications
        prisma.notification.count({
            where: { createdAt: { gte: todayStart } },
        }),
    ]);

    // Parse notification stats
    const notifStats = {
        total: 0,
        sent: 0,
        failed: 0,
        queued: 0,
    };
    for (const stat of notificationStats) {
        notifStats.total += stat._count;
        if (stat.status === 'SENT' || stat.status === 'PARTIAL') notifStats.sent += stat._count;
        if (stat.status === 'FAILED') notifStats.failed += stat._count;
        if (stat.status === 'QUEUED' || stat.status === 'SCHEDULED') notifStats.queued += stat._count;
    }

    // Parse delivery stats
    const delStats = {
        total: 0,
        delivered: 0,
        failed: 0,
        pending: 0,
    };
    for (const stat of deliveryStats) {
        delStats.total += stat._count;
        if (stat.status === 'DELIVERED') delStats.delivered += stat._count;
        if (stat.status === 'FAILED') delStats.failed += stat._count;
        if (stat.status === 'PENDING' || stat.status === 'RETRY') delStats.pending += stat._count;
    }

    const memUsage = process.memoryUsage();

    return {
        timestamp: now.toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        memory: {
            used: Math.floor(memUsage.heapUsed / 1024 / 1024),
            total: Math.floor(memUsage.heapTotal / 1024 / 1024),
            percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        },
        notifications: {
            ...notifStats,
            today: todayNotifications,
        },
        deliveries: {
            ...delStats,
            successRate: delStats.total > 0
                ? Math.round((delStats.delivered / delStats.total) * 100)
                : 100,
        },
        queues: queueHealth,
        apps: appCount,
        users: userCount,
        devices: {
            total: deviceStats[0],
            active: deviceStats[1],
        },
        dlq: {
            unprocessed: dlqCount,
        },
    };
}

/**
 * Get Prometheus-compatible metrics
 */
export async function getPrometheusMetrics(): Promise<string> {
    const m = await collectMetrics();

    return `
# HELP notifyx_uptime_seconds Server uptime in seconds
# TYPE notifyx_uptime_seconds counter
notifyx_uptime_seconds ${m.uptime}

# HELP notifyx_memory_used_mb Memory used in MB
# TYPE notifyx_memory_used_mb gauge
notifyx_memory_used_mb ${m.memory.used}

# HELP notifyx_notifications_total Total notifications
# TYPE notifyx_notifications_total counter
notifyx_notifications_total ${m.notifications.total}

# HELP notifyx_notifications_sent Sent notifications
# TYPE notifyx_notifications_sent counter
notifyx_notifications_sent ${m.notifications.sent}

# HELP notifyx_notifications_failed Failed notifications
# TYPE notifyx_notifications_failed counter
notifyx_notifications_failed ${m.notifications.failed}

# HELP notifyx_notifications_queued Queued notifications
# TYPE notifyx_notifications_queued gauge
notifyx_notifications_queued ${m.notifications.queued}

# HELP notifyx_deliveries_success_rate Delivery success rate percentage
# TYPE notifyx_deliveries_success_rate gauge
notifyx_deliveries_success_rate ${m.deliveries.successRate}

# HELP notifyx_queue_waiting Queue waiting jobs
# TYPE notifyx_queue_waiting gauge
notifyx_queue_waiting{priority="normal"} ${m.queues.normal.waiting}
notifyx_queue_waiting{priority="high"} ${m.queues.high.waiting}

# HELP notifyx_queue_active Queue active jobs
# TYPE notifyx_queue_active gauge
notifyx_queue_active{priority="normal"} ${m.queues.normal.active}
notifyx_queue_active{priority="high"} ${m.queues.high.active}

# HELP notifyx_dlq_unprocessed Dead letter queue unprocessed count
# TYPE notifyx_dlq_unprocessed gauge
notifyx_dlq_unprocessed ${m.dlq.unprocessed}

# HELP notifyx_devices_active Active devices
# TYPE notifyx_devices_active gauge
notifyx_devices_active ${m.devices.active}

# HELP notifyx_apps_total Total apps
# TYPE notifyx_apps_total gauge
notifyx_apps_total ${m.apps}

# HELP notifyx_users_total Total users
# TYPE notifyx_users_total gauge
notifyx_users_total ${m.users}
`.trim();
}
