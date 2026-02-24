import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/response";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Global error handler — uses the spec response envelope:
 * { error: true, message: string, data: any }
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let data: unknown = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    data = err.errors || null;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation Error";
    data = err.issues;
  } else if (!isProduction) {
    // In development, surface the real error for debugging
    message = err.message;
    data = err.stack;
  }

  // Always log unexpected (5xx) errors server-side
  if (statusCode >= 500) {
    console.error(
      JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode,
        error: err.message,
        stack: !isProduction ? err.stack : undefined,
      }),
    );
  }

  res.status(statusCode).json({
    error: true,
    message,
    data,
  });
};
