import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import {
  registerUserSchema,
  registerDeviceSchema,
  updateUserNicknameSchema,
  deviceHeartbeatSchema,
  setTestFavouritesSchema,
} from "../schemas/users";
import { AppError, sendSuccess } from "../utils/response";
import { hashToken, encryptToken } from "../utils/crypto";
import { canAccessAppId } from "../middleware/tenantScope";
import {
  getUnreachableBreakdown,
  isDeviceHealthEnabled,
} from "../services/deviceHealth";
import { invalidateCache } from "../middleware/cacheMiddleware";
import { triggerAutomation } from "../services/automation-engine";

const normalizeNickname = (nickname?: string | null) => {
  const trimmed = nickname?.trim();
  return trimmed ? trimmed : null;
};

const normalizePhone = (phone?: string | null) => {
  const trimmed = phone?.trim();
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
    const { appId, search, language, page = "1", limit = "20" } = req.query;
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
      const term = String(search).trim();
      // Free-text search spans the three identifiers an operator actually has
      // on hand: the external id, the display nickname, and the phone number.
      where.OR = [
        { externalUserId: { contains: term, mode: "insensitive" } },
        { nickname: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
      ];
    }
    if (language) where.language = String(language);
    // Reachability. `hasDevices` is the coarse form kept for compatibility;
    // `reachability` splits the unreachable group by cause, because the two
    // halves need completely different remedies:
    //   never_registered — no device row was ever created (push setup never
    //                      completed); push can never reach them.
    //   token_dead       — they had a working device the provider later
    //                      rejected (usually an uninstall); re-registering on
    //                      next launch revives the existing row.
    const reachability = req.query.reachability as string | undefined;
    if (reachability === "reachable") {
      where.devices = { some: { isActive: true, tokenInvalidAt: null } };
    } else if (reachability === "never_registered") {
      where.devices = { none: {} };
    } else if (reachability === "token_dead") {
      where.devices = {
        some: {},
        none: { isActive: true, tokenInvalidAt: null },
      };
    } else if (req.query.hasDevices === "true") {
      where.devices = { some: { isActive: true, tokenInvalidAt: null } };
    } else if (req.query.hasDevices === "false") {
      where.devices = { none: { isActive: true, tokenInvalidAt: null } };
    }
    // Restrict to users that have at least one deliverable device — used by the
    // notification target pickers so they only paginate over reachable users.
    if (req.query.withDevices === "true") {
      where.devices = { some: { isActive: true, tokenInvalidAt: null } };
    }
    // Favourite ("test") user filter. `true` -> only favourites (loaded first
    // in the target pickers); `false` -> only the rest (the "load other users"
    // page). Absent -> all users.
    if (req.query.isTestUser === "true") {
      where.isTestUser = true;
    } else if (req.query.isTestUser === "false") {
      where.isTestUser = false;
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
      search,
      tokenValid,
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
    // A device can be "active" but carry a token the provider has already
    // rejected — those are dead weight in the list, so they get their own axis.
    if (tokenValid === "true") where.tokenInvalidAt = null;
    else if (tokenValid === "false") where.tokenInvalidAt = { not: null };
    if (search) {
      const term = String(search).trim();
      // Push tokens are stored encrypted and hashed, so they are not
      // searchable; match on the identifiers an operator can actually see.
      where.OR = [
        { externalDeviceId: { contains: term, mode: "insensitive" } },
        { user: { externalUserId: { contains: term, mode: "insensitive" } } },
        { user: { nickname: { contains: term, mode: "insensitive" } } },
        { user: { phone: { contains: term, mode: "insensitive" } } },
      ];
    }
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
              phone: true,
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

    // Deactivate ONLY this device. Never delete the user here — doing so
    // cascade-deletes every other device and the user's entire notification
    // history. Sending stops for this token because the worker filters on
    // { isActive: true }, while history (NotificationDelivery) is preserved.
    const device = await prisma.device.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: req.adminUser?.id ?? req.machineAuth?.keyId ?? null,
        deactivationReason: "MANUAL_DEACTIVATION",
      },
    });

    await Promise.all([invalidateCache("/devices"), invalidateCache("/users")]);
    sendSuccess(res, {
      deactivated: true,
      deviceId: device.id,
      userId: existing.user.id,
      isActive: device.isActive,
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

// Replace the set of favourite ("test") users for an app. Any user not in the
// provided list is unflagged; everyone in it is flagged. Used by the Users &
// Devices page; surfaced first in every test-target picker.
export const setTestFavourites = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId, externalUserIds } = setTestFavouritesSchema.parse(req.body);

    if (!canAccessAppId(req, appId)) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }
    if (req.machineAuth && req.machineAuth.appId !== appId) {
      throw new AppError(403, "API key is not scoped to this app", "FORBIDDEN");
    }

    // De-dupe and drop blanks.
    const ids = Array.from(
      new Set(
        externalUserIds
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    );

    await prisma.$transaction([
      // Unflag any current favourite that is no longer in the list.
      prisma.user.updateMany({
        where: { appId, isTestUser: true, externalUserId: { notIn: ids } },
        data: { isTestUser: false },
      }),
      // Flag everyone in the list (no-op for ids that don't exist).
      ...(ids.length > 0
        ? [
            prisma.user.updateMany({
              where: { appId, externalUserId: { in: ids } },
              data: { isTestUser: true },
            }),
          ]
        : []),
    ]);

    // Return the canonical, persisted set (only ids that actually exist).
    const favourites = await prisma.user.findMany({
      where: { appId, isTestUser: true, deletedAt: null },
      select: { externalUserId: true },
    });

    await invalidateCache("/users");
    sendSuccess(res, {
      appId,
      externalUserIds: favourites.map((u) => u.externalUserId),
    });
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
        ...(data.phone !== undefined
          ? { phone: normalizePhone(data.phone) }
          : {}),
      },
      create: {
        appId: data.appId,
        externalUserId: data.externalUserId,
        language: data.language ?? "en",
        timezone: data.timezone ?? "UTC",
        nickname: normalizeNickname(data.nickname),
        phone: normalizePhone(data.phone),
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
    const deviceIdentity = data.externalDeviceId?.trim() || undefined;

    // Whenever a device (re-)registers with a fresh token we must clear any
    // prior invalidation/deactivation state. The delivery worker only targets
    // devices where { isActive: true, tokenInvalidAt: null }, so leaving these
    // fields set after a token refresh permanently excludes a perfectly valid
    // device from all future sends (the classic "stopped getting pushes and
    // never recovered" failure).
    // Web push is the only transport that tells us when a subscription lapses;
    // everywhere else this stays null because the token has no fixed lifetime.
    const tokenExpiresAt = data.tokenExpiresAt
      ? new Date(data.tokenExpiresAt)
      : null;

    const reactivationFields = {
      isActive: true,
      tokenInvalidAt: null,
      tokenExpiresAt,
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
      deactivationNote: null,
      lastSeenAt: new Date(),
    };

    // Prefer client-managed externalDeviceId for subscription refreshes, then
    // fall back to the internal device UUID for backwards compatibility.
    const existing = deviceIdentity
      ? await prisma.device.findFirst({
          where: {
            externalDeviceId: deviceIdentity,
            user: { appId: user.appId },
          },
          select: { id: true },
        } as any)
      : data.deviceId
        ? await prisma.device.findUnique({
            where: { id: data.deviceId },
            include: { user: { select: { appId: true } } },
          })
        : null;

    const scopedExisting =
      existing as ({ id: string; user?: { appId: string } } & Record<string, unknown>) | null;

    if (
      scopedExisting &&
      (!scopedExisting.user || scopedExisting.user.appId === user.appId)
    ) {
        device = await prisma.device.update({
          where: { id: scopedExisting.id },
          data: {
            userId: data.userId,
            platform: data.platform,
            provider: data.provider,
            pushToken: encryptedPushToken,
            tokenHash: tokenHashed,
            ...(deviceIdentity ? { externalDeviceId: deviceIdentity } : {}),
            ...reactivationFields,
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
    // If the supplied identity was invalid or belongs to another app, fall
    // through to the normal upsert path below (graceful degradation).

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
            platform: data.platform,
            pushToken: encryptedPushToken,
            ...(deviceIdentity ? { externalDeviceId: deviceIdentity } : {}),
            ...reactivationFields,
          },
          create: {
            userId: data.userId,
            platform: data.platform,
            pushToken: encryptedPushToken,
            tokenHash: tokenHashed,
            provider: data.provider,
            ...(deviceIdentity ? { externalDeviceId: deviceIdentity } : {}),
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
              provider: data.provider,
              pushToken: encryptedPushToken,
              ...(deviceIdentity ? { externalDeviceId: deviceIdentity } : {}),
              ...reactivationFields,
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
              ...(deviceIdentity ? { externalDeviceId: deviceIdentity } : {}),
              isActive: true,
            },
          });
        }
      }
    }

    // Return device without exposing encrypted token
    const responseDevice = device as typeof device & {
      externalDeviceId?: string | null;
    };

    sendSuccess(res, {
      id: responseDevice.id,
      externalDeviceId: responseDevice.externalDeviceId ?? null,
      userId: responseDevice.userId,
      platform: responseDevice.platform,
      provider: responseDevice.provider,
      isActive: responseDevice.isActive,
      lastSeenAt: responseDevice.lastSeenAt,
      createdAt: responseDevice.createdAt,
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

/**
 * Why an app's users are unreachable, and what can still be done about them.
 * GET /users/reachability?appId=...
 */
export const getReachability = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const appId = req.query.appId as string | undefined;
    if (!appId) {
      throw new AppError(400, "appId is required", "APP_ID_REQUIRED");
    }
    if (!canAccessAppId(req, appId)) {
      throw new AppError(403, "You do not have access to this app", "FORBIDDEN");
    }

    const [breakdown, totalUsers, reachableUsers] = await Promise.all([
      getUnreachableBreakdown(appId),
      prisma.user.count({ where: { appId, deletedAt: null } }),
      prisma.user.count({
        where: {
          appId,
          deletedAt: null,
          devices: { some: { isActive: true, tokenInvalidAt: null } },
        },
      }),
    ]);

    sendSuccess(res, {
      appId,
      totalUsers,
      reachableUsers,
      unreachableUsers: totalUsers - reachableUsers,
      ...breakdown,
      sweepEnabled: isDeviceHealthEnabled(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * An app-scoped machine key may only act on its own app.
 * Mirrors the guard in `controllers/notifications.ts`.
 */
function assertMachineKeyAppAccess(req: Request, appId: string): void {
  if (req.machineAuth && req.machineAuth.appId !== appId) {
    throw new AppError(403, "API key is not scoped to this app", "FORBIDDEN");
  }
}

/**
 * Device heartbeat — the client telling us it is alive.
 *
 * This is the inverse of probing the provider: instead of the server spending
 * FCM/APNs quota to ask "is this token still good?", the SDK reports in when
 * the app is opened. It costs one cheap write, consumes no provider quota, and
 * cannot be rate-limited by Google or Apple.
 *
 * What it proves and what it does not:
 *   - A heartbeat is positive proof the app is installed and running.
 *   - Silence is NOT proof of death — a user who simply has not opened the app
 *     in two months looks identical to one who uninstalled. Absence of a
 *     heartbeat should age a device out of "recently confirmed", never mark it
 *     invalid.
 *
 * Also self-healing: if the device was previously flagged dead by a failed
 * send, a successful heartbeat proves that verdict is stale and clears it.
 */
export const deviceHeartbeat = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = deviceHeartbeatSchema.parse(req.body);
    assertMachineKeyAppAccess(req, data.appId);

    const device = data.externalDeviceId
      ? await prisma.device.findFirst({
          where: {
            externalDeviceId: data.externalDeviceId,
            user: { appId: data.appId },
          },
          select: {
            id: true,
            tokenHash: true,
            isActive: true,
            tokenInvalidAt: true,
          },
        })
      : await prisma.device.findFirst({
          where: { id: data.deviceId, user: { appId: data.appId } },
          select: {
            id: true,
            tokenHash: true,
            isActive: true,
            tokenInvalidAt: true,
          },
        });

    // No record for this device: tell the client to do a full registration
    // rather than 404-ing it. This is how a device that was never registered
    // (or was hard-reset server-side) repairs itself on next app open.
    if (!device) {
      sendSuccess(res, {
        acknowledged: false,
        action: "register",
        reason: "DEVICE_NOT_FOUND",
      });
      return;
    }

    // If the client sent a token that differs from what we hold, it rotated
    // since the last registration — ask for a full re-register so the new token
    // is stored encrypted through the normal path.
    if (data.pushToken) {
      const incomingHash = hashToken(data.pushToken);
      if (incomingHash !== device.tokenHash) {
        sendSuccess(res, {
          acknowledged: true,
          action: "register",
          reason: "TOKEN_ROTATED",
        });
        return;
      }
    }

    const revived = !device.isActive || device.tokenInvalidAt !== null;

    await prisma.device.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        // A live app is proof any earlier "token dead" verdict is now wrong.
        ...(revived
          ? {
              isActive: true,
              tokenInvalidAt: null,
              deactivatedAt: null,
              deactivatedBy: null,
              deactivationReason: null,
              deactivationNote: null,
            }
          : {}),
        ...(data.tokenExpiresAt
          ? { tokenExpiresAt: new Date(data.tokenExpiresAt) }
          : {}),
      },
    });

    sendSuccess(res, {
      acknowledged: true,
      action: "none",
      revived,
    });
  } catch (error) {
    next(error);
  }
};
