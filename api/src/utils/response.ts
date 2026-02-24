import type { Response } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public errors?: any,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

import type { ApiResponse } from "../interfaces/utils/response";

export type { ApiResponse };

/**
 * Send a success response using the spec envelope:
 * { error: false, message: string, data: T, totalCount?: number }
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode = 200,
  message = "Success",
) => {
  const response: ApiResponse<T> = {
    error: false,
    message,
    data,
  };
  return res.status(statusCode).json(response);
};

/**
 * Send a paginated success response with totalCount in the spec envelope.
 */
export const sendPaginated = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  statusCode = 200,
) => {
  const response: ApiResponse<T[]> = {
    error: false,
    message: "Success",
    data,
    totalCount: total,
  };
  return res.status(statusCode).json(response);
};

// sendError removed in favor of global error handler
