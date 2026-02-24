/**
 * Admin Authentication Controller
 * Handles admin user login, session management, and password operations
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../services/database";
import { sendSuccess, sendPaginated, AppError } from "../utils/response";
import { AdminRole } from "@prisma/client";
import {
  loginSchema,
  registerSchema,
  signupSchema,
  changePasswordSchema,
  updateAdminAppsSchema,
} from "../schemas/admin";

// Session duration: 24 hours
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getManagedAppIds(adminUserId: string): Promise<string[]> {
  const managed = await prisma.appManager.findMany({
    where: { adminUserId },
    select: { appId: true },
  });
  return managed.map((m) => m.appId);
}

/**
 * Hash password using PBKDF2-SHA512 with random salt
 */
function hashPassword(
  password: string,
  salt?: string,
): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, usedSalt, 100000, 64, "sha512")
    .toString("hex");
  return { hash: `${usedSalt}:${hash}`, salt: usedSalt };
}

/**
 * Verify password against stored hash (timing-safe comparison)
 */
function verifyPassword(password: string, storedHash: string): boolean {
  const [salt] = storedHash.split(":");
  const { hash: computedHash } = hashPassword(password, salt);
  // Use timing-safe comparison to prevent timing side-channel attacks
  if (storedHash.length !== computedHash.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(storedHash, "utf8"),
    Buffer.from(computedHash, "utf8"),
  );
}

/**
 * Generate secure session token
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash a session token using SHA-256 for storage.
 * The raw token is returned to the client; only the hash is stored in DB.
 * This prevents session hijacking via database leaks.
 */
function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Login admin user
 */
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.isActive) {
      throw new AppError(
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    if (!verifyPassword(password, user.passwordHash)) {
      throw new AppError(
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    // Create session — store only the hash; return raw token to client
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await prisma.adminSession.create({
      data: {
        adminUserId: user.id,
        token: tokenHash,
        expiresAt,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      },
    });

    // Update last login
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const managedApps =
      user.role === "SUPER_ADMIN" ? [] : await getManagedAppIds(user.id);

    sendSuccess(res, {
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        managedApps,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout (invalidate session)
 */
export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (token) {
      const tokenHash = hashSessionToken(token);
      await prisma.adminSession.deleteMany({
        where: { token: tokenHash },
      });
    }

    sendSuccess(res, { message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user info
 */
export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminUser = req.adminUser;

    if (!adminUser) {
      throw new AppError(401, "Not authenticated", "UNAUTHORIZED");
    }

    const managedApps =
      adminUser.role === "SUPER_ADMIN"
        ? []
        : await getManagedAppIds(adminUser.id);

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
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = registerSchema.parse(req.body);
    const normalizedEmail = normalizeEmail(data.email);

    // Check if email already exists
    const existing = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new AppError(400, "Email already registered", "EMAIL_EXISTS");
    }

    const { hash } = hashPassword(data.password);

    const user = await prisma.adminUser.create({
      data: {
        email: normalizedEmail,
        passwordHash: hash,
        name: data.name,
        role: (data.role || "MARKETING_MANAGER") as AdminRole,
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
 * Signup invited admin user (no auth required)
 * Requires at least one active app invite for the email address.
 */
export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = signupSchema.parse(req.body);
    const normalizedEmail = normalizeEmail(data.email);
    const now = new Date();

    const existing = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      throw new AppError(400, "Email already registered", "EMAIL_EXISTS");
    }

    await prisma.appAccessInvite.updateMany({
      where: {
        email: normalizedEmail,
        status: "PENDING",
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED" },
    });

    const invites = await prisma.appAccessInvite.findMany({
      where: {
        email: normalizedEmail,
        status: "PENDING",
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      select: {
        id: true,
        appId: true,
        role: true,
      },
    });

    if (invites.length === 0) {
      throw new AppError(
        403,
        "No pending invitation found for this email",
        "INVITE_REQUIRED",
      );
    }

    if (invites.some((invite) => invite.role === "SUPER_ADMIN")) {
      throw new AppError(400, "Invalid invitation role", "INVALID_INVITE_ROLE");
    }

    const appIds = Array.from(new Set(invites.map((invite) => invite.appId)));
    const role: AdminRole = invites.some((invite) => invite.role === "APP_MANAGER")
      ? "APP_MANAGER"
      : "MARKETING_MANAGER";

    const { hash } = hashPassword(data.password);
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          email: normalizedEmail,
          passwordHash: hash,
          name: data.name,
          role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      if (appIds.length > 0) {
        await tx.appManager.createMany({
          data: appIds.map((appId) => ({
            adminUserId: created.id,
            appId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.appAccessInvite.updateMany({
        where: {
          id: { in: invites.map((invite) => invite.id) },
        },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
          acceptedByAdminUserId: created.id,
        },
      });

      await tx.adminSession.create({
        data: {
          adminUserId: created.id,
          token: tokenHash,
          expiresAt,
          userAgent: req.headers["user-agent"],
          ipAddress: req.ip,
        },
      });

      return created;
    });

    sendSuccess(
      res,
      {
        token,
        expiresAt,
        user: {
          ...user,
          managedApps: appIds,
        },
      },
      201,
    );
  } catch (error) {
    next(error);
  }
};

/**
 * List all admin users (SUPER_ADMIN only)
 */
export const listAdmins = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      prisma.adminUser.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          managedApps: {
            select: {
              appId: true,
              app: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.adminUser.count(),
    ]);

    const mapped = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      managedApps: user.managedApps.map((managed) => managed.appId),
      managedAppDetails: user.managedApps.map((managed) => managed.app),
    }));

    sendPaginated(res, mapped, total, pageNum, limitNum);
  } catch (error) {
    next(error);
  }
};

const updateAdminSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "APP_MANAGER", "MARKETING_MANAGER"]).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Update admin user role or status (SUPER_ADMIN only)
 */
export const updateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.params.id as string;
    const data = updateAdminSchema.parse(req.body);
    const existing = await prisma.adminUser.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new AppError(404, "Admin user not found");
    }

    // Prevent super admin from deactivating themselves
    if (data.isActive === false && req.adminUser?.id === id) {
      throw new AppError(
        400,
        "Cannot deactivate your own account",
        "SELF_DEACTIVATION",
      );
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({
        where: { id },
        data: {
          ...(data.role && { role: data.role as AdminRole }),
          ...(typeof data.isActive === "boolean" && { isActive: data.isActive }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      if (updated.role === "SUPER_ADMIN") {
        await tx.appManager.deleteMany({ where: { adminUserId: id } });
      }

      return updated;
    });

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

/**
 * Assign app access to non-super-admin user (SUPER_ADMIN only)
 */
export const assignAppToManager = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { adminUserId, appId } = req.body;

    const [admin, app] = await Promise.all([
      prisma.adminUser.findUnique({
        where: { id: adminUserId },
        select: { id: true, role: true },
      }),
      prisma.app.findUnique({
        where: { id: appId },
        select: { id: true },
      }),
    ]);

    if (!admin) {
      throw new AppError(404, "Admin user not found");
    }

    if (!app) {
      throw new AppError(404, "App not found");
    }

    if (admin.role === "SUPER_ADMIN") {
      throw new AppError(400, "Cannot assign apps to SUPER_ADMIN users");
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
 * Replace app assignments for a non-super-admin user (SUPER_ADMIN only)
 */
export const updateAdminApps = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminUserId = req.params.id as string;
    const { appIds } = updateAdminAppsSchema.parse(req.body);
    const uniqueAppIds = Array.from(new Set(appIds));

    const [admin, appCount] = await Promise.all([
      prisma.adminUser.findUnique({
        where: { id: adminUserId },
        select: { id: true, role: true, email: true, name: true },
      }),
      uniqueAppIds.length
        ? prisma.app.count({ where: { id: { in: uniqueAppIds } } })
        : Promise.resolve(0),
    ]);

    if (!admin) {
      throw new AppError(404, "Admin user not found");
    }

    if (admin.role === "SUPER_ADMIN") {
      throw new AppError(400, "Cannot assign apps to SUPER_ADMIN users");
    }

    if (uniqueAppIds.length !== appCount) {
      throw new AppError(400, "One or more apps do not exist", "INVALID_APP_IDS");
    }

    await prisma.$transaction(async (tx) => {
      await tx.appManager.deleteMany({
        where: {
          adminUserId,
          ...(uniqueAppIds.length > 0 ? { appId: { notIn: uniqueAppIds } } : {}),
        },
      });

      if (uniqueAppIds.length > 0) {
        await tx.appManager.createMany({
          data: uniqueAppIds.map((appId) => ({ adminUserId, appId })),
          skipDuplicates: true,
        });
      }
    });

    const managedApps = await prisma.appManager.findMany({
      where: { adminUserId },
      select: {
        appId: true,
        app: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    sendSuccess(res, {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      managedApps: managedApps.map((item) => item.appId),
      managedAppDetails: managedApps.map((item) => item.app),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove app from APP_MANAGER (SUPER_ADMIN only)
 */
export const removeAppFromManager = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminUserId = req.params.adminUserId as string;
    const appId = req.params.appId as string;

    await prisma.appManager
      .delete({
        where: { adminUserId_appId: { adminUserId, appId } },
      })
      .catch(() => null);

    sendSuccess(res, { message: "App removed from manager" });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password
 */
export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminUser = req.adminUser!;
    const { currentPassword, newPassword } = changePasswordSchema.parse(
      req.body,
    );

    const user = await prisma.adminUser.findUnique({
      where: { id: adminUser.id },
    });

    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      throw new AppError(400, "Current password is incorrect");
    }

    const { hash } = hashPassword(newPassword);

    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { passwordHash: hash },
    });

    // Invalidate all other sessions — compare by hash
    const currentToken = req.headers.authorization?.replace("Bearer ", "");
    const currentTokenHash = currentToken
      ? hashSessionToken(currentToken)
      : undefined;
    await prisma.adminSession.deleteMany({
      where: {
        adminUserId: adminUser.id,
        ...(currentTokenHash ? { token: { not: currentTokenHash } } : {}),
      },
    });

    sendSuccess(res, { message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * Create initial super admin (only works if no admins exist)
 *
 * Security hardening:
 *   1. Returns 404 (not 400) once an admin exists — hides the endpoint's existence.
 *   2. If ADMIN_SETUP_TOKEN env is set, the request must include a matching
 *      `x-setup-token` header. This prevents race-condition abuse on first deploy.
 *   3. Validates body through registerSchema.
 */
export const setupInitialAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // ── Gate 1: If an admin already exists, behave as if the route doesn't exist.
    const count = await prisma.adminUser.count();
    if (count > 0) {
      throw new AppError(404, "Not found");
    }

    // ── Gate 2: Optional setup token guard (recommended for production).
    const setupToken = process.env.ADMIN_SETUP_TOKEN;
    if (setupToken) {
      const provided = req.headers["x-setup-token"] as string | undefined;
      if (
        !provided ||
        provided.length !== setupToken.length ||
        !crypto.timingSafeEqual(
          Buffer.from(provided, "utf8"),
          Buffer.from(setupToken, "utf8"),
        )
      ) {
        throw new AppError(
          403,
          "Invalid or missing setup token",
          "SETUP_TOKEN_INVALID",
        );
      }
    }

    const data = registerSchema.parse(req.body);
    const normalizedEmail = normalizeEmail(data.email);
    const { hash } = hashPassword(data.password);

    const user = await prisma.adminUser.create({
      data: {
        email: normalizedEmail,
        passwordHash: hash,
        name: data.name,
        role: "SUPER_ADMIN", // First user is always super admin
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    console.log(
      `[Admin] Initial super admin created: ${user.email} (${user.id})`,
    );

    sendSuccess(
      res,
      {
        message: "Initial admin created successfully",
        user,
      },
      201,
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get initial setup status for portal startup flow.
 * Returns whether creating the first admin is still allowed.
 */
export const getSetupStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminCount = await prisma.adminUser.count();
    const setupRequired = adminCount === 0;

    sendSuccess(res, {
      setupRequired,
      setupTokenRequired: Boolean(process.env.ADMIN_SETUP_TOKEN),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get onboarding status for the authenticated admin user.
 * Returns whether the user has created any apps and configured credentials.
 * Used by the portal to show an onboarding wizard for new users.
 */
export const getOnboardingStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const adminUser = req.adminUser;

    if (!adminUser) {
      throw new AppError(401, "Not authenticated", "UNAUTHORIZED");
    }

    // Check if user has any apps (scoped to their role)
    let appCount: number;
    if (adminUser.role === "SUPER_ADMIN") {
      appCount = await prisma.app.count();
    } else {
      const managed = await getManagedAppIds(adminUser.id);
      appCount = managed.length;
    }

    // Check if any app has at least one active credential version
    let hasCredentials = false;
    if (appCount > 0) {
      const activeCredential = await prisma.credentialVersion.findFirst({
        where: { isActive: true },
      });
      hasCredentials = !!activeCredential;
    }

    sendSuccess(res, {
      hasApps: appCount > 0,
      hasCredentials,
      isOnboarded: appCount > 0 && hasCredentials,
    });
  } catch (error) {
    next(error);
  }
};
