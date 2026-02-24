/**
 * Request ID Middleware
 * Assigns a unique ID to every request for end-to-end tracing.
 * Spec: "requestId, tenantId, appId, route, status, latencyMs" in every log line.
 *
 * - If the client sends `X-Request-Id`, it is reused (truncated to 128 chars).
 * - Otherwise a new UUID-v4 is generated.
 * - The ID is set on the response header and attached to `req.requestId`.
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      /** Unique request identifier for tracing */
      requestId?: string;
    }
  }
}

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id =
    (req.headers["x-request-id"] as string)?.slice(0, 128) ||
    crypto.randomUUID();

  req.requestId = id;
  res.setHeader("X-Request-Id", id);

  next();
}

/**
 * Request logging middleware — logs method, path, status, latency, and requestId.
 * Should be mounted early (after requestId).
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on("finish", () => {
    const latencyMs = Date.now() - start;
    const log = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    };

    // Use structured JSON logging
    if (res.statusCode >= 500) {
      console.error(JSON.stringify(log));
    } else if (res.statusCode >= 400) {
      console.warn(JSON.stringify(log));
    } else {
      console.log(JSON.stringify(log));
    }
  });

  next();
}
