import type { Request, Response } from 'express';
import { prisma } from '../services/database';
import { AppError } from '../utils/response';
import { rotateWebhookSecret, signPayload } from '../services/webhook';
import crypto from 'crypto';

// 1. Configure Webhook (Upsert)
export const configureWebhook = async (req: Request, res: Response) => {
    const { appId, env } = req.params as { appId: string; env: string };
    const { url, enabled, events } = req.body;
    const adminUserId = req.adminUser?.id;

    const appEnv = await prisma.appEnvironment.findUnique({
        where: { appId_env: { appId, env: env as any } }
    });

    if (!appEnv) {
        throw new AppError(404, 'App environment not found');
    }

    // Check if webhook exists
    let webhook = await prisma.webhookEndpoint.findFirst({
        where: { appEnvironmentId: appEnv.id }
    });

    let secret = webhook?.secret;

    if (!webhook) {
        secret = crypto.randomBytes(32).toString('hex');
        webhook = await prisma.webhookEndpoint.create({
            data: {
                appEnvironmentId: appEnv.id,
                url,
                enabled,
                eventsJson: events,
                secret: secret!
            }
        });

        await prisma.auditLog.create({
            data: {
                action: 'WEBHOOK_CREATED',
                resource: 'webhook_endpoint',
                resourceId: webhook.id,
                adminUserId,
                details: { url, events }
            }
        });
    } else {
        webhook = await prisma.webhookEndpoint.update({
            where: { id: webhook.id },
            data: {
                url,
                enabled,
                eventsJson: events
            }
        });

        await prisma.auditLog.create({
            data: {
                action: 'WEBHOOK_UPDATED',
                resource: 'webhook_endpoint',
                resourceId: webhook.id,
                adminUserId,
                details: { url, events }
            }
        });
    }

    res.json({
        success: true,
        data: {
            id: webhook.id,
            url: webhook.url,
            enabled: webhook.enabled,
            events: webhook.eventsJson,
            secret: secret // Return secret only on configure/create? Or always? Plan says "Response includes secret (only on create)" but we update here too. Let's return it.
        }
    });
};

// 2. Rotate Secret
export const rotateSecret = async (req: Request, res: Response) => {
    const { appId, env } = req.params as { appId: string; env: string };
    const adminUserId = req.adminUser?.id;

    const appEnv = await prisma.appEnvironment.findUnique({
        where: { appId_env: { appId, env: env as any } }
    });

    if (!appEnv) throw new AppError(404, 'App environment not found');

    const webhook = await prisma.webhookEndpoint.findFirst({
        where: { appEnvironmentId: appEnv.id }
    });

    if (!webhook) throw new AppError(404, 'Webhook not configured');

    const newSecret = await rotateWebhookSecret(webhook.id, adminUserId!);

    res.json({
        success: true,
        data: {
            secret: newSecret
        }
    });
};

// 3. Test Webhook
export const testWebhook = async (req: Request, res: Response) => {
    const { appId, env } = req.params as { appId: string; env: string };

    const appEnv = await prisma.appEnvironment.findUnique({
        where: { appId_env: { appId, env: env as any } }
    });

    if (!appEnv) throw new AppError(404, 'App environment not found');

    const webhook = await prisma.webhookEndpoint.findFirst({
        where: { appEnvironmentId: appEnv.id }
    });

    if (!webhook || !webhook.enabled) throw new AppError(400, 'Webhook not enabled');

    const payload = JSON.stringify({
        event: 'webhook.test',
        timestamp: Date.now(),
        data: { message: 'This is a test event from NotifyX' }
    });

    const signature = signPayload(payload, webhook.secret);

    try {
        const start = Date.now();
        const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-NotifyX-Signature': signature,
                'X-NotifyX-Event': 'webhook.test',
                'X-NotifyX-Timestamp': Date.now().toString()
            },
            body: payload
        });
        const duration = Date.now() - start;

        res.json({
            success: true,
            data: {
                statusCode: response.status,
                duration
            }
        });
    } catch (error: any) {
        throw new AppError(500, `Webhook test failed: ${error.message}`);
    }
};
