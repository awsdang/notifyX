import { z } from 'zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';

export interface OpenApiPathDefinition {
    method: HttpMethod;
    path: string;
    description?: string;
    summary?: string;
    tags?: string[];
    operationId?: string;
    request?: {
        params?: z.ZodType<any>;
        query?: z.ZodType<any>;
        headers?: z.ZodType<any>;
        body?: {
            content: {
                [mediaType: string]: {
                    schema: z.ZodType<any>;
                };
            };
            description?: string;
            required?: boolean;
        };
    };
    responses: {
        [statusCode: number | string]: {
            description: string;
            content?: {
                [mediaType: string]: {
                    schema: z.ZodType<any>;
                };
            };
            headers?: {
                [headerName: string]: {
                    description?: string;
                    schema?: z.ZodType<any>;
                };
            };
        };
    };
    security?: Array<Record<string, string[]>>;
    deprecated?: boolean;
}

export class PathRegistry {
    private paths: OpenApiPathDefinition[] = [];

    registerPath(definition: OpenApiPathDefinition) {
        this.paths.push(definition);
    }

    getPaths() {
        return this.paths;
    }
}

export const pathRegistry = new PathRegistry();
