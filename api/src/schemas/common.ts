import { z } from 'zod';

// Strict success response (no error field)
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
    success: z.literal(true).describe('Whether the request was successful').meta({ example: true }),
    data: dataSchema.describe('The response data'),
});

// Strict error response (no data field, error is required)
export const errorResponseSchema = z.object({
    success: z.literal(false).describe('Whether the request was successful').meta({ example: false }),
    error: z.object({
        code: z.string().optional(),
        message: z.string(),
        details: z.any().optional(),
    }).describe('Error details').meta({ example: { code: 'ERROR_CODE', message: 'Error message' } }),
});

// Union for runtime validation (backward compatibility if needed, but we prefer specific schemas for docs)
export const responseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.union([
    successResponseSchema(dataSchema),
    errorResponseSchema
]);

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
    success: z.boolean().describe('Whether the request was successful').meta({ example: true }),
    data: z.array(dataSchema).describe('The paginated data'),
    meta: z.object({
        page: z.number().describe('Current page number'),
        limit: z.number().describe('Number of items per page'),
        total: z.number().describe('Total number of items'),
        totalPages: z.number().describe('Total number of pages'),
    }).describe('Pagination metadata').meta({ example: { page: 1, limit: 10, total: 100, totalPages: 10 } }),
});
