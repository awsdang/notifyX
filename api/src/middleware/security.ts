/**
 * Request Sanitization Middleware
 * Cleans and validates incoming data
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Sanitize string values to prevent XSS and injection
 */
function sanitizeString(value: string): string {
  return value
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .trim()
    .slice(0, 10000); // Limit string length
}

/**
 * Recursively sanitize object values
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Sanitize key as well (prevent prototype pollution)
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }

  return value;
}

/**
 * Sanitize request body
 */
export function sanitize(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  next();
}

/**
 * Validate Content-Type header
 */
export function validateContentType(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip for GET, DELETE, OPTIONS, HEAD
  if (["GET", "DELETE", "OPTIONS", "HEAD"].includes(req.method)) {
    return next();
  }

  const contentType = req.headers["content-type"];

  if (
    !contentType ||
    (!contentType.includes("application/json") &&
      !contentType.includes("multipart/form-data"))
  ) {
    res.status(415).json({
      error: true,
      message: "Content-Type must be application/json or multipart/form-data",
      data: null,
    });
    return;
  }

  next();
}

/**
 * Security headers — production-safe defaults
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isDocsRoute =
    req.path.startsWith("/docs") ||
    req.path.startsWith("/reference") ||
    req.path.startsWith("/api/docs") ||
    req.path.startsWith("/api/reference");

  // Prevent MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent click-jacking
  res.setHeader("X-Frame-Options", "DENY");
  // Legacy XSS filter (still useful for older browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Force HTTPS (safe for self-hosted behind TLS terminator)
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  // Content-Security-Policy
  // - API routes: deny all by default
  // - Docs routes: allow Scalar assets + inline bootstrap script
  if (isDocsRoute) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'",
    );
  } else {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
  }
  // Do not leak full URL in Referer header
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Restrict browser features the API should never use
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  // Prevent caching of API responses by default (individual routes can override)
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  // Hide server identity
  res.removeHeader("X-Powered-By");
  next();
}
