import { z } from 'zod';
import { registry } from '../docs/registry';
import { responseSchema } from './common';

export const assetSchema = z.object({
    id: z.uuid().meta({ example: 'asset-xyz' }),
    orgId: z.uuid().nullable().meta({ example: 'org-xyz' }),
    appId: z.uuid().meta({ example: 'app-xyz' }),
    type: z.enum(['CSV_AUDIENCE', 'IMAGE', 'OTHER']).meta({ example: 'CSV_AUDIENCE' }),
    url: z.string().url().meta({ example: 'https://example.com/asset.csv' }),
    mimeType: z.string().meta({ example: 'text/csv' }),
    size: z.number().meta({ example: 1024 }),
    sha256: z.string().meta({ example: 'sha256' }),
    createdBy: z.string().nullable().meta({ example: 'user-xyz' }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
})

export const assetResponseSchema = responseSchema(assetSchema).register(registry, { id: 'AssetResponse' });
