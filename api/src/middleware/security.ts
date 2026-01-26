/**
 * Request Sanitization Middleware
 * Cleans and validates incoming data
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Sanitize string values to prevent XSS and injection
 */
function sanitizeString(value: string): string {
    return value
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .trim()
        .slice(0, 10000); // Limit string length
}

/**
 * Recursively sanitize object values
 */
function sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return sanitizeString(value);
    }
    
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    
    if (value && typeof value === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            // Sanitize key as well (prevent prototype pollution)
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
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
export function sanitize(req: Request, res: Response, next: NextFunction): void {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeValue(req.body);
    }
    next();
}

/**
 * Validate Content-Type header
 */
export function validateContentType(req: Request, res: Response, next: NextFunction): void {
    // Skip for GET, DELETE, OPTIONS, HEAD
    if (['GET', 'DELETE', 'OPTIONS', 'HEAD'].includes(req.method)) {
        return next();
    }

    const contentType = req.headers['content-type'];
    
    if (!contentType || !contentType.includes('application/json')) {
        res.status(415).json({
            success: false,
            error: {
                message: 'Content-Type must be application/json',
                code: 'UNSUPPORTED_MEDIA_TYPE',
            },
        });
        return;
    }

    next();
}

/**
 * Security headers
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.removeHeader('X-Powered-By');
    next();
}
