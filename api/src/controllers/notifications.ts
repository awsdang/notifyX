import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { createNotificationSchema, sendEventSchema, testNotificationSchema } from '../schemas/notifications';
import { addNotificationToQueue } from '../services/queue';
import { sendSuccess, AppError } from '../utils/response';
import { logAudit, extractRequestInfo } from '../services/audit';
import { sendPush, type ProviderType, type PushMessage } from '../services/push-providers';

export const createNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = createNotificationSchema.parse(req.body);
        const adminUser = (req as any).adminUser;

        const app = await prisma.app.findUnique({ where: { id: data.appId } });
        if (!app) {
            throw new AppError(404, 'App not found', 'APP_NOT_FOUND');
        }

        if (app.isKilled) {
            throw new AppError(403, 'App is disabled. Cannot create notifications.', 'APP_KILLED');
        }

        const now = new Date();
        const sendAt = data.sendAt ? new Date(data.sendAt) : now;
        const isImmediate = sendAt <= now;
        const status = isImmediate ? 'QUEUED' : 'SCHEDULED';

        const payload = {
            userIds: data.userIds,
            adhocContent: {
                title: data.title,
                subtitle: data.subtitle,
                body: data.body,
                image: data.image,
                actionUrl: data.actionUrl,
                data: data.data,
            }
        } as any;

        const notification = await prisma.notification.create({
            data: {
                appId: data.appId,
                type: data.type,
                status: status,
                templateId: data.templateId,
                payload: payload,
                sendAt: sendAt,
                priority: data.priority,
                createdBy: adminUser?.id,
            },
        });

        if (isImmediate) {
            const delay = res.locals.rateLimitDelay || 0;
            // If rate limited, we still queue it but with a delay
            await addNotificationToQueue(notification.id, data.priority, delay);
        }

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'NOTIFICATION_CREATED',
            resource: 'notification',
            resourceId: notification.id,
            appId: data.appId,
            details: { type: data.type, status, userCount: data.userIds?.length || 0 },
            ...extractRequestInfo(req),
        });

        sendSuccess(res, notification, 201);
    } catch (error) {
        next(error);
    }
};

export const sendEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventName } = req.params as { eventName: string };
        const appId = req.body.appId;

        if (!appId || typeof appId !== 'string') {
            throw new AppError(400, "App ID required");
        }

        const app = await prisma.app.findUnique({ where: { id: appId } });
        if (!app) {
            throw new AppError(404, 'App not found', 'APP_NOT_FOUND');
        }

        if (app.isKilled) {
            throw new AppError(403, 'App is disabled. Cannot send notifications.', 'APP_KILLED');
        }

        const body = sendEventSchema.parse({ ...req.body, eventName });

        const user = await prisma.user.findUnique({
            where: { appId_externalUserId: { appId, externalUserId: body.externalUserId } }
        });

        const lang = user?.language || 'en';

        const template = await prisma.notificationTemplate.findFirst({
            where: {
                appId,
                eventName: String(eventName),
                language: lang
            }
        });

        const notification = await prisma.notification.create({
            data: {
                appId,
                type: 'transactional',
                status: 'QUEUED',
                templateId: template?.id,
                payload: {
                    userIds: [body.externalUserId],
                    variables: body.payload
                } as any,
                priority: body.priority || 'HIGH',
                sendAt: new Date(),
            }
        });

        await addNotificationToQueue(notification.id, body.priority || 'HIGH');

        sendSuccess(res, { status: 'ok', notificationId: notification.id });
    } catch (error) {
        next(error);
    }
};

export const cancelNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const adminUser = (req as any).adminUser;

        const existing = await prisma.notification.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'Notification not found', 'NOT_FOUND');
        }

        if (existing.status !== 'SCHEDULED' && existing.status !== 'QUEUED') {
            throw new AppError(400, 'Can only cancel SCHEDULED or QUEUED notifications', 'INVALID_STATUS');
        }

        const notification = await prisma.notification.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'NOTIFICATION_CANCELLED',
            resource: 'notification',
            resourceId: notification.id,
            appId: notification.appId,
            ...extractRequestInfo(req),
        });

        sendSuccess(res, notification);
    } catch (error) {
        next(error);
    }
};

export const scheduleNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const { sendAt } = req.body;
        const adminUser = (req as any).adminUser;

        if (!sendAt) {
            throw new AppError(400, 'sendAt is required', 'MISSING_SEND_AT');
        }

        const scheduleTime = new Date(sendAt);
        if (scheduleTime <= new Date()) {
            throw new AppError(400, 'sendAt must be in the future', 'INVALID_SCHEDULE');
        }

        const existing = await prisma.notification.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'Notification not found', 'NOT_FOUND');
        }

        if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
            throw new AppError(400, 'Can only schedule DRAFT or SCHEDULED notifications', 'INVALID_STATUS');
        }

        const app = await prisma.app.findUnique({ where: { id: existing.appId } });
        if (app?.isKilled) {
            throw new AppError(403, 'App is disabled. Cannot schedule notifications.', 'APP_KILLED');
        }

        const notification = await prisma.notification.update({
            where: { id },
            data: {
                status: 'SCHEDULED',
                sendAt: scheduleTime,
            },
        });

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'NOTIFICATION_SCHEDULED',
            resource: 'notification',
            resourceId: notification.id,
            appId: notification.appId,
            details: { scheduledFor: scheduleTime.toISOString() },
            ...extractRequestInfo(req),
        });

        sendSuccess(res, notification);
    } catch (error) {
        next(error);
    }
};

export const forceSendNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const adminUser = (req as any).adminUser;

        const existing = await prisma.notification.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'Notification not found', 'NOT_FOUND');
        }

        if (existing.status !== 'SCHEDULED' && existing.status !== 'DRAFT') {
            throw new AppError(400, 'Can only force send SCHEDULED or DRAFT notifications', 'INVALID_STATUS');
        }

        const app = await prisma.app.findUnique({ where: { id: existing.appId } });
        if (app?.isKilled) {
            throw new AppError(403, 'App is disabled. Cannot send notifications.', 'APP_KILLED');
        }

        const notification = await prisma.notification.update({
            where: { id },
            data: {
                status: 'QUEUED',
                sendAt: new Date(),
            },
        });

        await addNotificationToQueue(notification.id, notification.priority as 'LOW' | 'NORMAL' | 'HIGH');

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'NOTIFICATION_FORCE_SENT',
            resource: 'notification',
            resourceId: notification.id,
            appId: notification.appId,
            details: { previousStatus: existing.status, previousSendAt: existing.sendAt },
            ...extractRequestInfo(req),
        });

        sendSuccess(res, {
            notification,
            message: 'Notification queued for immediate delivery',
        });
    } catch (error) {
        next(error);
    }
};


export const sendTestNotification = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = testNotificationSchema.parse(req.body);
        const adminUser = (req as any).adminUser;

        const app = await prisma.app.findUnique({ where: { id: data.appId } });
        if (!app) {
            throw new AppError(404, 'App not found', 'APP_NOT_FOUND');
        }

        const device = await prisma.device.findUnique({
            where: { id: data.deviceId },
            include: { user: true },
        });

        if (!device) {
            throw new AppError(404, 'Device not found', 'DEVICE_NOT_FOUND');
        }

        if (!device.isActive) {
            throw new AppError(400, 'Device is not active', 'DEVICE_INACTIVE');
        }

        if (device.user.appId !== data.appId) {
            throw new AppError(400, 'Device does not belong to this app', 'DEVICE_APP_MISMATCH');
        }

        const message: PushMessage = {
            token: device.pushToken,
            title: data.title,
            body: data.body,
            data: {
                ...data.data,
                _test: 'true',
            },
        };

        const result = await sendPush(device.provider as ProviderType, message, data.appId);

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'NOTIFICATION_TEST_SENT',
            resource: 'notification',
            appId: data.appId,
            details: {
                deviceId: data.deviceId,
                provider: device.provider,
                success: result.success,
                error: result.error,
            },
            ...extractRequestInfo(req),
        });

        if (result.success) {
            sendSuccess(res, {
                success: true,
                message: 'Test notification sent successfully',
                provider: device.provider,
            });
        } else {
            if (result.invalidToken) {
                await prisma.device.update({
                    where: { id: device.id },
                    data: {
                        isActive: false,
                        tokenInvalidAt: new Date(),
                    },
                });
            }

            throw new AppError(502, result.error || 'Failed to send test notification', 'PUSH_FAILED');
        }
    } catch (error) {
        next(error);
    }
};

