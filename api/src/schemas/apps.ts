import { z } from 'zod';
import { registry } from '../docs/registry';
import { responseSchema } from './common';

export const createAppSchema = z.object({
    name: z.string().min(1).meta({ example: 'My App' }),
    defaultLanguage: z.string().default('en').meta({ example: 'en' }),
    platforms: z.object({
        android: z.boolean().default(false),
        ios: z.boolean().default(false),
        web: z.boolean().default(false),
        huawei: z.boolean().default(false),
    }).meta({ example: { android: true, ios: true } }),
}).register(registry, { id: 'CreateAppRequest' });

export const updateAppSchema = z.object({
    name: z.string().min(1).max(100).optional().meta({ example: 'My App' }),
    defaultLanguage: z.string().min(2).max(5).optional().meta({ example: 'en' }),
    platforms: z.object({
        android: z.boolean().optional(),
        ios: z.boolean().optional(),
        web: z.boolean().optional(),
        huawei: z.boolean().optional(),
    }).optional().meta({ example: { android: true, ios: true } }),
}).register(registry, { id: 'UpdateAppRequest' });

export const webhookConfigSchema = z.object({
    webhookUrl: z.url().nullable().optional().meta({ example: 'https://example.com/webhook' }),
    webhookSecret: z.string().min(16).max(256).nullable().optional().meta({ example: 'my-secret' }),
    webhookEnabled: z.boolean().optional().meta({ example: true }),
}).register(registry, { id: 'WebhookConfig' });

// Model Schemas
export const appSchema = z.object({
    id: z.uuid().meta({ example: 'app-xyz' }),
    name: z.string().meta({ example: 'My App' }),
    orgId: z.uuid().nullable().meta({ example: 'org-xyz' }),
    bundleId: z.string().nullable().meta({ example: 'com.example.app' }),
    packageName: z.string().nullable().meta({ example: 'com.example.app' }),
    platforms: z.object({
        android: z.boolean().optional(),
        ios: z.boolean().optional(),
        web: z.boolean().optional(),
        huawei: z.boolean().optional(),
    }).meta({ example: { android: true, ios: true } }),
    defaultLanguage: z.string().meta({ example: 'en' }),
    isKilled: z.boolean().meta({ example: false }),
    webhookUrl: z.string().nullable().meta({ example: 'https://example.com/webhook' }),
    webhookSecret: z.string().nullable().meta({ example: 'my-secret' }),
    webhookEnabled: z.boolean().meta({ example: true }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
});

// Response Schemas
export const appResponseSchema = responseSchema(appSchema).register(registry, { id: 'AppResponse' });
export const appListResponseSchema = responseSchema(z.array(appSchema)).register(registry, { id: 'AppListResponse' });

export const killAppResponseSchema = responseSchema(z.object({
    app: appSchema,
    cancelled: z.object({
        notifications: z.number(),
        campaigns: z.number(),
        abTests: z.number(),
    }).meta({ example: { notifications: 10, campaigns: 10, abTests: 10 } }),
})).register(registry, { id: 'KillAppResponse' });

export const webhookConfigResponseSchema = responseSchema(z.object({
    id: z.uuid().meta({ example: 'webhook-config-xyz' }),
    webhookUrl: z.string().nullable().meta({ example: 'https://example.com/webhook' }),
    webhookEnabled: z.boolean().meta({ example: true }),
    hasSecret: z.boolean().meta({ example: true }),
})).register(registry, { id: 'WebhookConfigResponse' });

export const testWebhookResponseSchema = responseSchema(z.object({
    success: z.boolean().meta({ example: true }),
    statusCode: z.number().meta({ example: 200 }),
    body: z.string().optional().meta({ example: 'Success' }),
})).register(registry, { id: 'TestWebhookResponse' });
