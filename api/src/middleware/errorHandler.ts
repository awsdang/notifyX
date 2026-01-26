import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/response';

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {

    let statusCode = 500;
    let message = 'Internal Server Error';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: any = undefined;

    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        code = err.code || 'ERROR';
        details = err.errors;
    } else if (err instanceof ZodError) {
        statusCode = 400;
        message = 'Validation Error';
        code = 'VALIDATION_ERROR';
        details = (err as any).errors;
    }

    res.status(statusCode).json({
        success: false,
        error: {
            message,
            code,
            details,
        },
    });
};
