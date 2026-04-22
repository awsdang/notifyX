import { z } from 'zod';
import { registry } from '../docs/registry';
import { responseSchema } from './common';

// Validation schemas
export const createCampaignSchema = z.object({
    appId: z.uuid().meta({ example: 'app-xyz' }),
    name: z.string().min(1).max(200).meta({ example: 'My Campaign' }),
    description: z.string().optional().meta({ example: 'Description of my campaign' }),
    targetingMode: z.enum(['ALL', 'USER_LIST', 'CSV']).default('ALL').meta({ example: 'ALL' }),
    targetUserIds: z.array(z.string()).optional().meta({ example: ['user-1', 'user-2'] }),
    title: z.string().min(1).max(200).meta({ example: 'My Campaign' }),
    subtitle: z.string().optional().meta({ example: 'Subtitle of my campaign' }),
    body: z.string().min(1).max(1000).meta({ example: 'Body of my campaign' }),
    image: z.url().optional().meta({ example: 'https://example.com/image.png' }),
    actionUrl: z.string().optional().meta({ example: 'https://example.com/action' }),
    tapActionType: z.enum(['open_app', 'open_url', 'deep_link', 'dismiss', 'none']).optional().meta({ example: 'open_app' }),
    data: z.record(z.string(), z.string()).optional().meta({ example: { orderId: '123' } }),
    actions: z.array(z.any()).optional().meta({ example: [{ action: 'open_url', title: 'Open', url: 'https://example.com' }] }),
    platforms: z.array(z.enum(['android', 'ios', 'huawei', 'web'])).optional().meta({ example: ['ios', 'android'] }),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL').meta({ example: 'NORMAL' }),
    scheduledAt: z.iso.datetime().optional().meta({ example: '2024-01-01T12:00:00Z' }),
    audienceSourceType: z.enum(['ALL', 'USER_LIST', 'CSV', 'SEGMENT']).optional().meta({ example: 'ALL' }),
    audienceAssetId: z.string().uuid().optional().meta({ example: 'audience-xyz' }),
}).register(registry, { id: 'CreateCampaignRequest' });

export const updateCampaignSchema = z.object({
    name: z.string().min(1).max(200).optional().meta({ example: 'My Campaign' }),
    description: z.string().optional().meta({ example: 'Description of my campaign' }),
    targetingMode: z.enum(['ALL', 'USER_LIST', 'CSV']).optional().meta({ example: 'ALL' }),
    targetUserIds: z.array(z.string()).optional().meta({ example: ['user-1', 'user-2'] }),
    title: z.string().min(1).max(200).optional().meta({ example: 'My Campaign' }),
    subtitle: z.string().optional().meta({ example: 'Subtitle of my campaign' }),
    body: z.string().min(1).max(1000).optional().meta({ example: 'Body of my campaign' }),
    image: z.url().optional().meta({ example: 'https://example.com/image.png' }),
    actionUrl: z.string().optional().meta({ example: 'https://example.com/action' }),
    tapActionType: z.enum(['open_app', 'open_url', 'deep_link', 'dismiss', 'none']).optional().meta({ example: 'open_app' }),
    data: z.record(z.string(), z.string()).optional().meta({ example: { orderId: '123' } }),
    actions: z.array(z.any()).optional().meta({ example: [{ action: 'open_url', title: 'Open', url: 'https://example.com' }] }),
    platforms: z.array(z.enum(['android', 'ios', 'huawei', 'web'])).optional().meta({ example: ['ios', 'android'] }),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional().meta({ example: 'NORMAL' }),
    scheduledAt: z.iso.datetime().optional().meta({ example: '2024-01-01T12:00:00Z' }),
    status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'CANCELLED']).optional().meta({ example: 'DRAFT' }),
}).register(registry, { id: 'UpdateCampaignRequest' });

// Model Schemas
export const campaignSchema = z.object({
    id: z.uuid().meta({ example: 'campaign-xyz' }),
    appId: z.uuid().meta({ example: 'app-xyz' }),
    name: z.string().meta({ example: 'My Campaign' }),
    description: z.string().nullable().meta({ example: 'Description of my campaign' }),
    status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'CANCELLED']).meta({ example: 'DRAFT' }),
    targetingMode: z.string().meta({ example: 'ALL' }),
    targetUserIds: z.array(z.string()).nullable().meta({ example: ['user-1', 'user-2'] }),
    csvFileUrl: z.string().nullable().meta({ example: 'https://example.com/asset.csv' }),
    totalTargets: z.number().meta({ example: 10 }),
    processedCount: z.number().meta({ example: 10 }),
    title: z.string().meta({ example: 'My Campaign' }),
    subtitle: z.string().nullable().meta({ example: 'Subtitle of my campaign' }),
    body: z.string().meta({ example: 'Body of my campaign' }),
    image: z.string().nullable().meta({ example: 'https://example.com/image.png' }),
    actionUrl: z.string().nullable().meta({ example: 'https://example.com/action' }),
    data: z.record(z.string(), z.string()).nullable().meta({ example: { orderId: '123' } }),
    actions: z.array(z.any()).nullable().meta({ example: [{ action: 'open_url', title: 'Open', url: 'https://example.com' }] }),
    platforms: z.array(z.enum(['android', 'ios', 'huawei', 'web'])).nullable().meta({ example: ['ios', 'android'] }),
    scheduledAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
    startedAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
    completedAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
    sentCount: z.number().meta({ example: 10 }),
    deliveredCount: z.number().meta({ example: 10 }),
    failedCount: z.number().meta({ example: 10 }),
    priority: z.string().meta({ example: 'NORMAL' }),
    createdBy: z.string().nullable().meta({ example: 'user-xyz' }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
})

// Response Schemas
export const campaignResponseSchema = responseSchema(campaignSchema).register(registry, { id: 'CampaignResponse' });
export const campaignListResponseSchema = responseSchema(z.array(campaignSchema)).register(registry, { id: 'CampaignListResponse' });

export const campaignStatsResponseSchema = responseSchema(z.object({
    campaign: z.object({
        id: z.uuid().meta({ example: 'campaign-xyz' }),
        name: z.string().meta({ example: 'My Campaign' }),
        status: z.string().meta({ example: 'DRAFT' }),
        startedAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
        completedAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
    }),
    stats: z.object({
        total: z.number().meta({ example: 10 }),
        processed: z.number().meta({ example: 10 }),
        sent: z.number().meta({ example: 10 }),
        delivered: z.number().meta({ example: 10 }),
        failed: z.number().meta({ example: 10 }),
        deliveryBreakdown: z.record(z.string(), z.number()).meta({ example: { 'android': 10, 'ios': 10 } }),
    }),
})).register(registry, { id: 'CampaignStatsResponse' });

export const audienceEstimateResponseSchema = responseSchema(z.object({
    users: z.number().meta({ example: 10 }),
    devices: z.number().meta({ example: 10 }),
})).register(registry, { id: 'AudienceEstimateResponse' });

export const detailedAudienceEstimateResponseSchema = responseSchema(z.object({
    estimatedUsers: z.number().meta({ example: 10 }),
    estimatedDevices: z.number().meta({ example: 10 }),
    breakdown: z.record(z.string(), z.number()).meta({ example: { 'android': 10, 'ios': 10 } }),
    assumptions: z.object({
        excludedInactive: z.boolean().meta({ example: true }),
        excludedInvalidTokens: z.boolean().meta({ example: true }),
    }).meta({ example: { excludedInactive: true, excludedInvalidTokens: true } }),
})).register(registry, { id: 'DetailedAudienceEstimateResponse' });
