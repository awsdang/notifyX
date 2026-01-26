/**
 * Admin Authentication Controller
 * Handles admin user login, session management, and password operations
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../services/database';
import { sendSuccess, AppError } from '../utils/response';
import { AdminRole } from '@prisma/client';
import { loginSchema, registerSchema, changePasswordSchema } from '../schemas/admin';


// Session duration: 24 hours
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Hash password using SHA-256 with salt
 */
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const usedSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, usedSalt, 100000, 64, 'sha512').toString('hex');
    return { hash: `${usedSalt}:${hash}`, salt: usedSalt };
}

/**
 * Verify password against stored hash
 */
function verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    const { hash: computedHash } = hashPassword(password, salt);
    return storedHash === computedHash;
}

/**
 * Generate secure session token
 */
function generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Login admin user
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await prisma.adminUser.findUnique({
            where: { email },
        });

        if (!user || !user.isActive) {
            throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
        }

        if (!verifyPassword(password, user.passwordHash)) {
            throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
        }

        // Create session
        const token = generateSessionToken();
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

        await prisma.adminSession.create({
            data: {
                adminUserId: user.id,
                token,
                expiresAt,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip,
            },
        });

        // Update last login
        await prisma.adminUser.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        sendSuccess(res, {
            token,
            expiresAt,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Logout (invalidate session)
 */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token) {
            await prisma.adminSession.deleteMany({
                where: { token },
            });
        }

        sendSuccess(res, { message: 'Logged out successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * Get current user info
 */
export const me = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminUser = (req as any).adminUser;

        if (!adminUser) {
            throw new AppError(401, 'Not authenticated', 'UNAUTHORIZED');
        }

        // Get managed apps if APP_MANAGER
        let managedApps: string[] = [];
        if (adminUser.role === 'APP_MANAGER') {
            const managed = await prisma.appManager.findMany({
                where: { adminUserId: adminUser.id },
                select: { appId: true },
            });
            managedApps = managed.map(m => m.appId);
        }

        sendSuccess(res, {
            id: adminUser.id,
            email: adminUser.email,
            name: adminUser.name,
            role: adminUser.role,
            managedApps,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Register new admin user (SUPER_ADMIN only)
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = registerSchema.parse(req.body);

        // Check if email already exists
        const existing = await prisma.adminUser.findUnique({
            where: { email: data.email },
        });

        if (existing) {
            throw new AppError(400, 'Email already registered', 'EMAIL_EXISTS');
        }

        const { hash } = hashPassword(data.password);

        const user = await prisma.adminUser.create({
            data: {
                email: data.email,
                passwordHash: hash,
                name: data.name,
                role: (data.role || 'MARKETING_MANAGER') as AdminRole,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            },
        });

        sendSuccess(res, user, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * List all admin users (SUPER_ADMIN only)
 */
export const listAdmins = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const users = await prisma.adminUser.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        sendSuccess(res, users);
    } catch (error) {
        next(error);
    }
};

/**
 * Update admin user role or status (SUPER_ADMIN only)
 */
export const updateAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { role, isActive } = req.body;

        const user = await prisma.adminUser.update({
            where: { id },
            data: {
                ...(role && { role }),
                ...(typeof isActive === 'boolean' && { isActive }),
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
            },
        });

        sendSuccess(res, user);
    } catch (error) {
        next(error);
    }
};

/**
 * Assign app to APP_MANAGER (SUPER_ADMIN only)
 */
export const assignAppToManager = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { adminUserId, appId } = req.body;

        // Verify admin is APP_MANAGER
        const admin = await prisma.adminUser.findUnique({
            where: { id: adminUserId },
        });

        if (!admin) {
            throw new AppError(404, 'Admin user not found');
        }

        if (admin.role !== 'APP_MANAGER') {
            throw new AppError(400, 'Can only assign apps to APP_MANAGER role');
        }

        const assignment = await prisma.appManager.upsert({
            where: { adminUserId_appId: { adminUserId, appId } },
            create: { adminUserId, appId },
            update: {},
            select: {
                id: true,
                appId: true,
                adminUser: { select: { email: true, name: true } },
                app: { select: { name: true } },
            },
        });

        sendSuccess(res, assignment, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * Remove app from APP_MANAGER (SUPER_ADMIN only)
 */
export const removeAppFromManager = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminUserId = req.params.adminUserId as string;
        const appId = req.params.appId as string;

        await prisma.appManager.delete({
            where: { adminUserId_appId: { adminUserId, appId } },
        }).catch(() => null);

        sendSuccess(res, { message: 'App removed from manager' });
    } catch (error) {
        next(error);
    }
};

/**
 * Change password
 */
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const adminUser = (req as any).adminUser;
        const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

        const user = await prisma.adminUser.findUnique({
            where: { id: adminUser.id },
        });

        if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
            throw new AppError(400, 'Current password is incorrect');
        }

        const { hash } = hashPassword(newPassword);

        await prisma.adminUser.update({
            where: { id: adminUser.id },
            data: { passwordHash: hash },
        });

        // Invalidate all other sessions
        await prisma.adminSession.deleteMany({
            where: {
                adminUserId: adminUser.id,
                token: { not: req.headers.authorization?.replace('Bearer ', '') },
            },
        });

        sendSuccess(res, { message: 'Password changed successfully' });
    } catch (error) {
        next(error);
    }
};

/**
 * Create initial super admin (only works if no admins exist)
 */
export const setupInitialAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Check if any admin exists
        const count = await prisma.adminUser.count();

        if (count > 0) {
            throw new AppError(400, 'Admin already exists. Use the portal to manage admins.');
        }

        const data = registerSchema.parse(req.body);
        const { hash } = hashPassword(data.password);

        const user = await prisma.adminUser.create({
            data: {
                email: data.email,
                passwordHash: hash,
                name: data.name,
                role: 'SUPER_ADMIN', // First user is always super admin
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
            },
        });

        sendSuccess(res, {
            message: 'Initial admin created successfully',
            user,
        }, 201);
    } catch (error) {
        next(error);
    }
};
