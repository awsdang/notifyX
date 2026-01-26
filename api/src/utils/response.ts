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

import type { ApiResponse } from '../interfaces/utils/response';

export type { ApiResponse };

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
