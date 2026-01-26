import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { registerUserSchema, registerDeviceSchema } from '../schemas/users';
import { sendSuccess } from '../utils/response';

// Get users with pagination and filtering
export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { appId, search, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page as string, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const skip = (pageNum - 1) * limitNum;

        const where: any = { deletedAt: null };
        if (appId) where.appId = appId;
        if (search) {
            where.externalUserId = { contains: search as string, mode: 'insensitive' };
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
                include: {
                    app: { select: { id: true, name: true } },
                    _count: { select: { devices: true } },
                },
            }),
            prisma.user.count({ where }),
        ]);

        sendSuccess(res, {
            users,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
};

// Get a single user with their devices
export const getUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };

        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                app: { select: { id: true, name: true } },
                devices: {
                    orderBy: { lastSeenAt: 'desc' },
                },
            },
        });

        if (!user || user.deletedAt) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        sendSuccess(res, user);
    } catch (error) {
        next(error);
    }
};

// Get devices with pagination and filtering
export const getDevices = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, platform, provider, isActive, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(page as string, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const skip = (pageNum - 1) * limitNum;

        const where: any = {};
        if (userId) where.userId = userId;
        if (platform) where.platform = platform;
        if (provider) where.provider = provider;
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const [devices, total] = await Promise.all([
            prisma.device.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { lastSeenAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            externalUserId: true,
                            app: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.device.count({ where }),
        ]);

        sendSuccess(res, {
            devices,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
};

// Deactivate a device
export const deactivateDevice = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const { reason, note } = req.body;
        const adminUser = (req as any).adminUser;

        const device = await prisma.device.update({
            where: { id },
            data: {
                isActive: false,
                deactivatedAt: new Date(),
                deactivatedBy: adminUser?.id,
                deactivationReason: reason,
                deactivationNote: note
            },
        });

        sendSuccess(res, device);
    } catch (error) {
        next(error);
    }
};

// Delete a user (soft delete)
export const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };

        const user = await prisma.user.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        // Also deactivate all their devices
        await prisma.device.updateMany({
            where: { userId: id },
            data: { isActive: false },
        });

        sendSuccess(res, user);
    } catch (error) {
        next(error);
    }
};

export const registerUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = registerUserSchema.parse(req.body);

        // Upsert user
        const user = await prisma.user.upsert({
            where: {
                appId_externalUserId: {
                    appId: data.appId,
                    externalUserId: data.externalUserId,
                },
            },
            update: {
                language: data.language,
                timezone: data.timezone,
            },
            create: {
                appId: data.appId,
                externalUserId: data.externalUserId,
                language: data.language ?? 'en',
                timezone: data.timezone ?? 'UTC',
            },
        });

        sendSuccess(res, user);
    } catch (error) {
        next(error);
    }
};

export const registerDevice = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = registerDeviceSchema.parse(req.body);

        const device = await prisma.device.upsert({
            where: {
                pushToken_provider: {
                    pushToken: data.pushToken,
                    provider: data.provider,
                },
            },
            update: {
                userId: data.userId, // Reassign
                isActive: true,
                lastSeenAt: new Date(),
            },
            create: {
                userId: data.userId,
                platform: data.platform,
                pushToken: data.pushToken,
                provider: data.provider,
                isActive: true,
            },
        });

        sendSuccess(res, device);
    } catch (error) {
        next(error);
    }
};
