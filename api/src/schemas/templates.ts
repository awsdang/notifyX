import { z } from 'zod';
import { registry } from '../docs/registry';
import { responseSchema } from './common';

export const createTemplateSchema = z.object({
    appId: z.string().meta({ example: 'app-xyz' }),
    type: z.enum(['transactional', 'campaign']).meta({ example: 'transactional' }),
    eventName: z.string().meta({ example: 'order_created' }),
    language: z.enum(['en', 'ar', 'ku']).meta({ example: 'en' }),
    title: z.string().meta({ example: 'Order #{orderId}' }),
    subtitle: z.string().optional(),
    body: z.string().meta({ example: 'Your order has been created.' }),
    image: z.string().optional(),
    variables: z.array(z.string()).optional().meta({ example: ['orderId'] }),
}).register(registry, { id: 'CreateTemplateRequest' });

export const updateTemplateSchema = createTemplateSchema.partial().register(registry, { id: 'UpdateTemplateRequest' });

// Model Schemas
export const templateSchema = z.object({
    id: z.uuid().meta({ example: 'tmpl-xyz' }),
    appId: z.uuid().meta({ example: 'app-xyz' }),
    type: z.enum(['transactional', 'campaign']).meta({ example: 'transactional' }),
    eventName: z.string().meta({ example: 'order_created' }),
    language: z.enum(['en', 'ar', 'ku']).meta({ example: 'en' }),
    title: z.string().meta({ example: 'Order #{orderId}' }),
    subtitle: z.string().nullable().meta({ example: 'Subtitle' }),
    body: z.string().meta({ example: 'Your order has been created.' }),
    image: z.string().nullable().meta({ example: 'https://example.com/image.png' }),
    variables: z.array(z.string()).nullable().meta({ example: ['orderId'] }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
}).register(registry, { id: 'Template' });

// Response Schemas
export const templateResponseSchema = responseSchema(templateSchema).register(registry, { id: 'TemplateResponse' });
export const templateListResponseSchema = responseSchema(z.array(templateSchema)).register(registry, { id: 'TemplateListResponse' });
