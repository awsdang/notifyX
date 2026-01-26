import type { Response } from 'express';

export class AppError extends Error {
    constructor(
        public statusCode: number,
        public message: string,
        public code?: string,
        public errors?: any
    ) {
        super(message);
        Object.setPrototypeOf(this, AppError.prototype);
    }
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code?: string;
        message: string;
        details?: any;
    };
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
    };
}

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200) => {
    const response: ApiResponse<T> = {
        success: true,
        data,
    };
    return res.status(statusCode).json(response);
};

export const sendPaginated = <T>(
    res: Response,
    data: T[],
    total: number,
    page: number,
    limit: number,
    statusCode = 200
) => {
    const response: ApiResponse<T[]> = {
        success: true,
        data,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
    return res.status(statusCode).json(response);
};

// sendError removed in favor of global error handler
