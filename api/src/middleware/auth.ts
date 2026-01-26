/**
 * API Key Authentication Middleware
 * Simple and effective for service-to-service communication
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/response';

// Cache parsed API keys
let validApiKeys: Set<string> | null = null;

function getApiKeys(): Set<string> {
    if (validApiKeys) return validApiKeys;

    const keys = process.env.API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];
    validApiKeys = new Set(keys);
    return validApiKeys;
}

// Clear cache when needed (for testing)
export function clearApiKeyCache(): void {
    validApiKeys = null;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
    // Skip auth for health check, docs, metrics, and admin routes (admin has own auth)
    if (req.path === '/health' || 
        req.path === '/openapi.json' || 
        req.path.startsWith('/reference') ||
        req.path.startsWith('/metrics') ||
        req.path.startsWith('/admin')) {
        return next();
    }

    // Skip API key auth for credential routes (they use admin auth)
    if (req.path.includes('/credentials')) {
        return next();
    }

    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
        return next(new AppError(401, 'API key required', 'UNAUTHORIZED'));
    }

    const keys = getApiKeys();

    // In development, allow if no keys configured
    if (keys.size === 0 && process.env.NODE_ENV !== 'production') {
        console.warn('[Auth] No API keys configured - allowing request in development mode');
        return next();
    }

    if (!keys.has(apiKey)) {
        return next(new AppError(401, 'Invalid API key', 'UNAUTHORIZED'));
    }

    next();
}

// Optional: Extract app context from API key (for multi-tenant)
export interface AuthContext {
    apiKey: string;
    keyId?: string;
}

export function getAuthContext(req: Request): AuthContext | null {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) return null;
    
    return { apiKey };
}
