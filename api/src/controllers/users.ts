import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import {
  registerUserSchema,
  registerDeviceSchema,
  updateUserNicknameSchema,
} from "../schemas/users";
import { AppError, sendSuccess } from "../utils/response";
import { hashToken, encryptToken } from "../utils/crypto";
import { canAccessAppId } from "../middleware/tenantScope";
import { invalidateCache } from "../middleware/cacheMiddleware";
import { triggerAutomation } from "../services/automation-engine";

const normalizeNickname = (nickname?: string | null) => {
  const trimmed = nickname?.trim();
  return trimmed ? trimmed : null;
};

const isMissingUpsertConstraintError = (error: unknown): boolean => {
  const err = error as { message?: string } | undefined;
  const message = err?.message?.toLowerCase() || "";
  return message.includes("no unique or exclusion constraint matching the on conflict specification");
};

// Get users with pagination and filtering
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId, search, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { deletedAt: null };
    if (appId) where.appId = appId;
    if (req.accessibleAppIds !== null && req.accessibleAppIds !== undefined) {
      where.appId = appId
        ? {
          equals: String(appId),
          in: req.accessibleAppIds,
        }
        : { in: req.accessibleAppIds };
    }
    if (search) {
      where.OR = [
        {
          externalUserId: {
            contains: search as string,
            mode: "insensitive",
          },
        },
        {
          nickname: {
            contains: search as string,
            mode: "insensitive",
          },
        },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          app: { select: { id: true, name: true } },
          _count: {
            select: {
              devices: { where: { isActive: true, tokenInvalidAt: null } },
            },
          },
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
export const getUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        app: { select: { id: true, name: true } },
        devices: {
          orderBy: { lastSeenAt: "desc" },
        },
      },
    });

    if (!user || user.deletedAt) {
      return res
        .status(404)
        .json({ error: true, message: "User not found", data: null });
    }

    if (!canAccessAppId(req, user.appId)) {
      return res
        .status(404)
        .json({ error: true, message: "User not found", data: null });
    }

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

// Update a user nickname
export const updateUserNickname = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const { nickname } = updateUserNicknameSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, appId: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt || !canAccessAppId(req, existing.appId)) {
      return res
        .status(404)
        .json({ error: true, message: "User not found", data: null });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        nickname: normalizeNickname(nickname),
      },
    });

    await Promise.all([invalidateCache("/users"), invalidateCache("/devices")]);
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

// Get devices with pagination and filtering
export const getDevices = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      userId,
      appId,
      platform,
      provider,
      isActive,
      page = "1",
      limit = "20",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (userId) where.userId = userId;
    if (platform) where.platform = platform;
    if (provider) where.provider = provider;
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (appId) {
      where.user = {
        ...(where.user || {}),
        appId: { equals: String(appId) },
      };
    }
    if (req.accessibleAppIds !== null && req.accessibleAppIds !== undefined) {
      where.user = {
        ...(where.user || {}),
        appId: {
          ...(where.user?.appId || {}),
          in: req.accessibleAppIds,
        },
      };
    }

    const [devices, total] = await Promise.all([
      prisma.device.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { lastSeenAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              externalUserId: true,
              nickname: true,
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
export const deactivateDevice = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    // Verify device belongs to an accessible app
    const existing = await prisma.device.findUnique({
      where: { id },
      include: { user: { select: { id: true, appId: true } } },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ error: true, message: "Device not found", data: null });
    }

    // Check tenant scoping
    if (
      req.accessibleAppIds !== null &&
      req.accessibleAppIds !== undefined &&
      !req.accessibleAppIds.includes(existing.user.appId)
    ) {
      return res
        .status(404)
        .json({ error: true, message: "Device not found", data: null });
    }

    if (req.machineAuth && req.machineAuth.appId !== existing.user.appId) {
      return res
        .status(403)
        .json({ error: true, message: "API key is not scoped to this app", data: null });
    }

    await prisma.user.delete({
      where: { id: existing.user.id },
    });

    await Promise.all([invalidateCache("/devices"), invalidateCache("/users")]);
    sendSuccess(res, {
      deleted: true,
      deviceId: existing.id,
      userId: existing.user.id,
    });
  } catch (error) {
    next(error);
  }
};

// Reactivate a device
export const activateDevice = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const existing = await prisma.device.findUnique({
      where: { id },
      include: { user: { select: { appId: true } } },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ error: true, message: "Device not found", data: null });
    }

    if (
      req.accessibleAppIds !== null &&
      req.accessibleAppIds !== undefined &&
      !req.accessibleAppIds.includes(existing.user.appId)
    ) {
      return res
        .status(404)
        .json({ error: true, message: "Device not found", data: null });
    }

    if (req.machineAuth && req.machineAuth.appId !== existing.user.appId) {
      return res
        .status(403)
        .json({ error: true, message: "API key is not scoped to this app", data: null });
    }

    const device = await prisma.device.update({
      where: { id },
      data: {
        isActive: true,
        tokenInvalidAt: null,
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
        deactivationNote: null,
      },
    });

    await Promise.all([invalidateCache("/devices"), invalidateCache("/users")]);
    sendSuccess(res, device);
  } catch (error) {
    next(error);
  }
};

// Delete a user (soft delete)
export const deleteUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, appId: true },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      return res
        .status(404)
        .json({ error: true, message: "User not found", data: null });
    }

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

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
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
        ...(data.nickname !== undefined
          ? { nickname: normalizeNickname(data.nickname) }
          : {}),
      },
      create: {
        appId: data.appId,
        externalUserId: data.externalUserId,
        language: data.language ?? "en",
        timezone: data.timezone ?? "UTC",
        nickname: normalizeNickname(data.nickname),
      },
    });

    // Fire "On Registration" automation trigger
    await triggerAutomation(user.appId, "On Registration", {
      userId: user.id,
      externalUserId: user.externalUserId,
    });

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

export const registerDevice = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = registerDeviceSchema.parse(req.body);

    // Ensure target user exists and belongs to an accessible app.
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        appId: true,
        deletedAt: true,
        app: { select: { isKilled: true } },
      },
    });

    if (!user || user.deletedAt) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    if (!canAccessAppId(req, user.appId)) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    if (req.machineAuth && req.machineAuth.appId !== user.appId) {
      throw new AppError(
        403,
        "API key is not scoped to this app",
        "FORBIDDEN",
      );
    }

    if (user.app?.isKilled) {
      throw new AppError(
        403,
        "App is disabled. Cannot register devices.",
        "APP_KILLED",
      );
    }

    // Hash token for lookups, encrypt for storage — never store raw
    const tokenHashed = hashToken(data.pushToken);
    let encryptedPushToken: string;
    try {
      encryptedPushToken = encryptToken(data.pushToken);
    } catch {
      throw new AppError(
        500,
        "Server encryption configuration invalid",
        "ENCRYPTION_CONFIG_INVALID",
      );
    }

    let device;

    // When a deviceId is provided (e.g. on token refresh), update the existing
    // device record in-place to prevent creating duplicates for the same
    // physical device.
    if (data.deviceId) {
      const existing = await prisma.device.findUnique({
        where: { id: data.deviceId },
        include: { user: { select: { appId: true } } },
      });

      if (existing && existing.user.appId === user.appId) {
        device = await prisma.device.update({
          where: { id: data.deviceId },
          data: {
            userId: data.userId,
            platform: data.platform,
            pushToken: encryptedPushToken,
            tokenHash: tokenHashed,
            isActive: true,
            lastSeenAt: new Date(),
          },
        });

        // Deactivate any other device that happens to hold the new token
        // (edge case: token was briefly registered on another device record).
        await prisma.device.updateMany({
          where: {
            tokenHash: tokenHashed,
            provider: data.provider,
            id: { not: device.id },
          },
          data: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivationReason: "token_transferred",
          },
        });
      }
      // If deviceId was invalid or belongs to another app, fall through to
      // the normal upsert path below (graceful degradation).
    }

    if (!device) {
      try {
        device = await prisma.device.upsert({
          where: {
            tokenHash_provider: {
              tokenHash: tokenHashed,
              provider: data.provider,
            },
          },
          update: {
            userId: data.userId, // Reassign
            pushToken: encryptedPushToken,
            isActive: true,
            lastSeenAt: new Date(),
          },
          create: {
            userId: data.userId,
            platform: data.platform,
            pushToken: encryptedPushToken,
            tokenHash: tokenHashed,
            provider: data.provider,
            isActive: true,
          },
        });
      } catch (error) {
        if (!isMissingUpsertConstraintError(error)) {
          throw error;
        }

        // Fallback for environments where the unique(token_hash, provider)
        // constraint has not been applied yet.
        const existing = await prisma.device.findFirst({
          where: {
            tokenHash: tokenHashed,
            provider: data.provider,
          },
          select: { id: true },
        });

        if (existing) {
          device = await prisma.device.update({
            where: { id: existing.id },
            data: {
              userId: data.userId,
              platform: data.platform,
              pushToken: encryptedPushToken,
              isActive: true,
              lastSeenAt: new Date(),
            },
          });
        } else {
          device = await prisma.device.create({
            data: {
              userId: data.userId,
              platform: data.platform,
              pushToken: encryptedPushToken,
              tokenHash: tokenHashed,
              provider: data.provider,
              isActive: true,
            },
          });
        }
      }
    }

    // Return device without exposing encrypted token
    sendSuccess(res, {
      id: device.id,
      userId: device.userId,
      platform: device.platform,
      provider: device.provider,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
    });
  } catch (error) {
    const err = error as { code?: string } | undefined;
    if (err?.code === "P2003") {
      return next(new AppError(400, "Invalid userId", "INVALID_USER_ID"));
    }
    if (err?.code === "P2002") {
      return next(
        new AppError(
          409,
          "Device with this token/provider already exists",
          "DEVICE_CONFLICT",
        ),
      );
    }
    next(error);
  }
};
