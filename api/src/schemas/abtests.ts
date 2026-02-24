import { z } from 'zod';
import { registry } from '../docs/registry';
import { responseSchema } from './common';

export const createABTestSchema = z.object({
    appId: z.uuid().meta({ example: 'app-xyz' }),
    name: z.string().min(1).max(200).meta({ example: 'My AB Test' }),
    description: z.string().optional().meta({ example: 'Description of my AB test' }),
    targetingMode: z.enum(['ALL', 'USER_LIST', 'CSV']).default('ALL').meta({ example: 'ALL' }),
    targetUserIds: z.array(z.string()).optional().meta({ example: ['user-1', 'user-2'] }),
    scheduledAt: z.iso.datetime().optional().meta({ example: '2024-01-01T12:00:00Z' }),
    variants: z.array(z.object({
        name: z.string().min(1).max(10),
        weight: z.number().min(1).max(100),
        title: z.string().min(1).max(200),
        subtitle: z.string().optional(),
        body: z.string().min(1).max(1000),
        image: z.url().optional(),
    })).min(2).max(5).meta({
        example: [
            { name: 'Variant 1', weight: 50, title: 'Variant 1', subtitle: 'Subtitle 1', body: 'Body 1', image: 'https://example.com/image.png' },
            { name: 'Variant 2', weight: 50, title: 'Variant 2', subtitle: 'Subtitle 2', body: 'Body 2', image: 'https://example.com/image.png' },
        ]
    }),
}).register(registry, { id: 'CreateABTestRequest' });

export const updateABTestSchema = z.object({
    name: z.string().min(1).max(200).optional().meta({ example: 'My AB Test' }),
    description: z.string().optional().meta({ example: 'Description of my AB test' }),
    targetingMode: z.enum(['ALL', 'USER_LIST', 'CSV']).optional().meta({ example: 'ALL' }),
    targetUserIds: z.array(z.string()).optional().meta({ example: ['user-1', 'user-2'] }),
    scheduledAt: z.iso.datetime().optional().meta({ example: '2024-01-01T12:00:00Z' }),
    variants: z.array(z.object({
        name: z.string().min(1).max(10),
        weight: z.number().min(1).max(100),
        title: z.string().min(1).max(200),
        subtitle: z.string().optional(),
        body: z.string().min(1).max(1000),
        image: z.url().optional(),
    })).min(2).max(5).optional(),
}).register(registry, { id: 'UpdateABTestRequest' });

export const abTestSendTestSchema = z.object({
    userIds: z.array(z.string().min(1)).min(1).max(50000),
}).register(registry, { id: 'ABTestSendTestRequest' });

export const abTestScheduleLiveSchema = z.object({
    sendAt: z.iso.datetime().optional(),
}).register(registry, { id: 'ABTestScheduleLiveRequest' });

// Model Schemas
export const variantSchema = z.object({
    id: z.uuid().meta({ example: 'variant-xyz' }),
    testId: z.uuid().meta({ example: 'test-xyz' }),
    name: z.string().meta({ example: 'Variant 1' }),
    weight: z.number().meta({ example: 50 }),
    title: z.string().meta({ example: 'Variant 1' }),
    subtitle: z.string().nullable().meta({ example: 'Subtitle 1' }),
    body: z.string().meta({ example: 'Body 1' }),
    image: z.string().nullable().meta({ example: 'https://example.com/image.png' }),
    sentCount: z.number().meta({ example: 10 }),
    deliveredCount: z.number().meta({ example: 10 }),
    failedCount: z.number().meta({ example: 10 }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
})

export const abTestSchema = z.object({
    id: z.uuid().meta({ example: 'test-xyz' }),
    appId: z.uuid().meta({ example: 'app-xyz' }),
    name: z.string().meta({ example: 'My AB Test' }),
    description: z.string().nullable().meta({ example: 'Description of my AB test' }),
    status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']).meta({ example: 'DRAFT' }),
    targetingMode: z.string().meta({ example: 'ALL' }),
    targetUserIds: z.array(z.string()).nullable().meta({ example: ['user-1', 'user-2'] }),
    csvFileUrl: z.string().nullable().meta({ example: 'https://example.com/file.csv' }),
    scheduledAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
    startedAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
    completedAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
    createdBy: z.string().nullable().meta({ example: 'user-xyz' }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
    variants: z.array(variantSchema).optional(),
    _count: z.object({
        assignments: z.number(),
    }).optional().meta({ example: { assignments: 10 } }),
})

// Response Schemas

export const variantResponseSchema = responseSchema(variantSchema).register(registry, { id: 'ABTestVariantResponse' });
export const abTestResponseSchema = responseSchema(abTestSchema).register(registry, { id: 'ABTestResponse' });
export const abTestListResponseSchema = responseSchema(z.array(abTestSchema)).register(registry, { id: 'ABTestListResponse' });
export const abTestResultsResponseSchema = responseSchema(z.object({
    test: z.object({
        id: z.uuid().meta({ example: 'test-xyz' }),
        name: z.string().meta({ example: 'My AB Test' }),
        status: z.string().meta({ example: 'DRAFT' }),
        startedAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
        completedAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
        totalAssignments: z.number().meta({ example: 10 }),
    }),
    results: z.array(z.object({
        variantId: z.uuid().meta({ example: 'variant-xyz' }),
        name: z.string().meta({ example: 'Variant 1' }),
        weight: z.number().meta({ example: 50 }),
        title: z.string().meta({ example: 'Variant 1' }),
        body: z.string().meta({ example: 'Body 1' }),
        stats: z.object({
            sent: z.number(),
            delivered: z.number(),
            failed: z.number(),
            deliveryRate: z.number(),
        }).meta({ example: { sent: 10, delivered: 10, failed: 10, deliveryRate: 10 } }),
    })),
})).register(registry, { id: 'ABTestResultsResponse' });
