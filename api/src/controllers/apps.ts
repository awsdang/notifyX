import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database';
import { createAppSchema, updateAppSchema, webhookConfigSchema } from '../schemas/apps';
import { sendSuccess, AppError } from '../utils/response';
import { logAudit, extractRequestInfo } from '../services/audit';
import { normalQueue, highQueue } from '../services/queue';
import { testWebhook } from '../services/webhook';

// Helper to safely get a string from query params
const getQueryString = (val: any): string | undefined => {
    if (typeof val === 'string') return val;
    if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
    return undefined;
};

export const createApp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = createAppSchema.parse(req.body);
        const adminUser = (req as any).adminUser;

        const app = await prisma.app.create({
            data: {
                name: data.name,
                defaultLanguage: data.defaultLanguage,
                platforms: data.platforms,
            },
        });

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'APP_CREATED',
            resource: 'app',
            resourceId: app.id,
            appId: app.id,
            details: { name: app.name },
            ...extractRequestInfo(req),
        });

        sendSuccess(res, app, 201);
    } catch (error) {
        next(error);
    }
};

export const getApps = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const apps = await prisma.app.findMany();
        sendSuccess(res, apps);
    } catch (error) {
        next(error);
    }
};

export const getApp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const app = await prisma.app.findUnique({ where: { id: String(id) } });
        if (!app) {
            throw new AppError(404, 'App not found');
        }
        sendSuccess(res, app);
    } catch (error) {
        next(error);
    }
};

export const updateApp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const adminUser = (req as any).adminUser;

        const data = updateAppSchema.parse(req.body);

        const existing = await prisma.app.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'App not found');
        }

        const app = await prisma.app.update({
            where: { id },
            data,
        });

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'APP_UPDATED',
            resource: 'app',
            resourceId: app.id,
            appId: app.id,
            details: { changes: data },
            ...extractRequestInfo(req),
        });

        sendSuccess(res, app);
    } catch (error) {
        next(error);
    }
};

export const killApp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const adminUser = (req as any).adminUser;

        const existing = await prisma.app.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'App not found');
        }

        if (existing.isKilled) {
            throw new AppError(400, 'App is already killed', 'APP_ALREADY_KILLED');
        }

        const cancelledNotifications = await prisma.notification.updateMany({
            where: {
                appId: id,
                status: { in: ['SCHEDULED', 'QUEUED', 'DRAFT'] },
            },
            data: { status: 'CANCELLED' },
        });

        const cancelledCampaigns = await prisma.campaign.updateMany({
            where: {
                appId: id,
                status: { in: ['SCHEDULED', 'DRAFT', 'PROCESSING'] },
            },
            data: { status: 'CANCELLED' },
        });

        const cancelledTests = await prisma.aBTest.updateMany({
            where: {
                appId: id,
                status: { in: ['DRAFT', 'ACTIVE'] },
            },
            data: { status: 'CANCELLED' },
        });

        const scheduledNotifications = await prisma.notification.findMany({
            where: {
                appId: id,
                status: 'CANCELLED',
            },
            select: { id: true },
        });

        for (const notif of scheduledNotifications) {
            try {
                const jobs = await normalQueue.getJobs(['waiting', 'delayed']);
                for (const job of jobs) {
                    if (job.data?.notificationId === notif.id) {
                        await job.remove();
                    }
                }
                const highJobs = await highQueue.getJobs(['waiting', 'delayed']);
                for (const job of highJobs) {
                    if (job.data?.notificationId === notif.id) {
                        await job.remove();
                    }
                }
            } catch (e) {
                console.error(`[KillSwitch] Failed to remove job for notification ${notif.id}:`, e);
            }
        }

        const app = await prisma.app.update({
            where: { id },
            data: { isKilled: true },
        });

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'APP_KILLED',
            resource: 'app',
            resourceId: app.id,
            appId: app.id,
            details: {
                cancelledNotifications: cancelledNotifications.count,
                cancelledCampaigns: cancelledCampaigns.count,
                cancelledTests: cancelledTests.count,
            },
            ...extractRequestInfo(req),
        });

        sendSuccess(res, {
            app,
            cancelled: {
                notifications: cancelledNotifications.count,
                campaigns: cancelledCampaigns.count,
                abTests: cancelledTests.count,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const reviveApp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const adminUser = (req as any).adminUser;

        const existing = await prisma.app.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'App not found');
        }

        if (!existing.isKilled) {
            throw new AppError(400, 'App is not killed', 'APP_NOT_KILLED');
        }

        const app = await prisma.app.update({
            where: { id },
            data: { isKilled: false },
        });

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'APP_REVIVED',
            resource: 'app',
            resourceId: app.id,
            appId: app.id,
            ...extractRequestInfo(req),
        });

        sendSuccess(res, app);
    } catch (error) {
        next(error);
    }
};

export const updateWebhookConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const adminUser = (req as any).adminUser;

        const data = webhookConfigSchema.parse(req.body);

        const existing = await prisma.app.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'App not found');
        }

        const app = await prisma.app.update({
            where: { id },
            data: {
                webhookUrl: data.webhookUrl,
                webhookSecret: data.webhookSecret,
                webhookEnabled: data.webhookEnabled,
            },
        });

        await logAudit({
            adminUserId: adminUser?.id,
            action: 'APP_UPDATED',
            resource: 'app',
            resourceId: app.id,
            appId: app.id,
            details: { webhookConfigured: !!app.webhookUrl },
            ...extractRequestInfo(req),
        });

        sendSuccess(res, {
            id: app.id,
            webhookUrl: app.webhookUrl,
            webhookEnabled: app.webhookEnabled,
            hasSecret: !!app.webhookSecret,
        });
    } catch (error) {
        next(error);
    }
};

export const testWebhookEndpoint = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };

        const existing = await prisma.app.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'App not found');
        }

        if (!existing.webhookUrl) {
            throw new AppError(400, 'No webhook URL configured', 'NO_WEBHOOK_URL');
        }

        const result = await testWebhook(existing.webhookUrl, existing.webhookSecret || '');

        if (result.success) {
            sendSuccess(res, {
                success: true,
                statusCode: result.status,
                body: result.body,
            });
        } else {
            throw new AppError(502, result.body || 'Webhook test failed', 'WEBHOOK_TEST_FAILED');
        }
    } catch (error) {
        next(error);
    }
};

export const createAppEnvironment = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const { env, isEnabled } = req.body;

        const app = await prisma.app.findUnique({ where: { id } });
        if (!app) {
            throw new AppError(404, 'App not found');
        }

        const appEnvironment = await prisma.appEnvironment.upsert({
            where: { appId_env: { appId: id, env } },
            update: { isEnabled: isEnabled !== undefined ? isEnabled : true },
            create: {
                appId: id,
                env,
                isEnabled: isEnabled !== undefined ? isEnabled : true
            }
        });

        sendSuccess(res, appEnvironment, 201);
    } catch (error) {
        next(error);
    }
};
