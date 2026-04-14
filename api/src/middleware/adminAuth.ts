/**
 * Admin Authentication & Authorization Middleware
 * Role-based access control for portal operations
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../services/database";
import { AppError } from "../utils/response";
import type { AdminRole } from "@prisma/client";
import {
  getUserPermissions,
  getUserOrgIds,
  assertCan,
  assertCanAny,
  canAccessApp as authzCanAccessApp,
  type AuthContext,
} from "../services/authz";

/**
 * Hash session token the same way admin.ts stores it.
 */
function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Extend Express Request to include admin user
declare global {
  namespace Express {
    interface Request {
      adminUser?: {
        id: string;
        email: string;
        name: string;
        role: AdminRole;
        permissions?: string[];
        orgIds?: string[];
      };
    }
  }
}

/**
 * Authenticate admin user via Bearer token
 */
export async function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const token = authHeader.replace("Bearer ", "");
    const tokenHash = hashSessionToken(token);

    // Find valid session by hash
    const session = await prisma.adminSession.findUnique({
      where: { token: tokenHash },
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!session) {
      throw new AppError(401, "Invalid or expired session", "INVALID_SESSION");
    }

    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await prisma.adminSession.delete({ where: { id: session.id } });
      throw new AppError(401, "Session expired", "SESSION_EXPIRED");
    }

    if (!session.adminUser.isActive) {
      throw new AppError(403, "Account is disabled", "ACCOUNT_DISABLED");
    }

    // Attach user to request
    req.adminUser = session.adminUser;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Require specific roles
 */
export function requireRole(...allowedRoles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const adminUser = req.adminUser;

    if (!adminUser) {
      return next(new AppError(401, "Authentication required", "UNAUTHORIZED"));
    }

    if (!allowedRoles.includes(adminUser.role)) {
      return next(new AppError(403, "Insufficient permissions", "FORBIDDEN"));
    }

    next();
  };
}

/**
 * Require SUPER_ADMIN role
 */
export const requireSuperAdmin = requireRole("SUPER_ADMIN");

/**
 * Require SUPER_ADMIN or APP_MANAGER role
 */
export const requireManager = requireRole("SUPER_ADMIN", "APP_MANAGER");

/**
 * Require any admin role (for templates and stats)
 */
export const requireAnyAdmin = requireRole(
  "SUPER_ADMIN",
  "APP_MANAGER",
  "MARKETING_MANAGER",
);

/**
 * Require marketing access (templates, notifications, stats)
 */
export const requireMarketing = requireRole(
  "SUPER_ADMIN",
  "APP_MANAGER",
  "MARKETING_MANAGER",
);

export function requireMarketingOrMachineAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.machineAuth) {
    return next();
  }

  return requireMarketing(req, res, next);
}

/**
 * Check if user can manage a specific app
 * SUPER_ADMIN can manage all apps
 * APP_MANAGER can only manage assigned apps
 */
export async function canManageApp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const adminUser = req.adminUser;
    // Support both :appId and :id route params
    const appId = req.params.appId || req.params.id || req.body?.appId;

    if (!adminUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    // SUPER_ADMIN can manage all apps
    if (adminUser.role === "SUPER_ADMIN") {
      return next();
    }

    // APP_MANAGER must have explicit access
    if (adminUser.role === "APP_MANAGER") {
      if (!appId) {
        throw new AppError(400, "App ID required");
      }

      const assignment = await prisma.appManager.findUnique({
        where: {
          adminUserId_appId: {
            adminUserId: adminUser.id,
            appId,
          },
        },
      });

      if (!assignment) {
        throw new AppError(
          403,
          "You do not have permission to manage this app",
          "FORBIDDEN",
        );
      }

      return next();
    }

    throw new AppError(403, "Insufficient permissions", "FORBIDDEN");
  } catch (error) {
    next(error);
  }
}

/**
 * Clean up expired sessions (call periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.adminSession.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

/**
 * Require specific permission(s) - all permissions must be present
 * Uses new fine-grained RBAC via Organization memberships
 */
export function requirePermission(...permissions: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const adminUser = req.adminUser;

      if (!adminUser) {
        throw new AppError(401, "Authentication required", "UNAUTHORIZED");
      }

      // Get appId from params or body for context
      const appId = req.params.appId || req.params.id || req.body?.appId;
      const orgId = req.params.orgId || req.body?.orgId;

      const ctx: AuthContext = {
        adminUserId: adminUser.id,
        appId,
        orgId,
      };

      // SUPER_ADMIN bypass
      if (adminUser.role === "SUPER_ADMIN") {
        return next();
      }

      // Check all required permissions
      for (const permission of permissions) {
        await assertCan(permission, ctx);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Require at least one of the specified permissions
 */
export function requireAnyPermission(...permissions: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const adminUser = req.adminUser;

      if (!adminUser) {
        throw new AppError(401, "Authentication required", "UNAUTHORIZED");
      }

      const appId = req.params.appId || req.params.id || req.body?.appId;
      const orgId = req.params.orgId || req.body?.orgId;

      const ctx: AuthContext = {
        adminUserId: adminUser.id,
        appId,
        orgId,
      };

      await assertCanAny(permissions, ctx);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user can access an app via org membership (new RBAC)
 * Falls back to legacy AppManager check for backward compatibility
 */
export async function canAccessAppViaOrg(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const adminUser = req.adminUser;
    const appId = req.params.appId || req.params.id || req.body?.appId;

    if (!adminUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    if (!appId) {
      throw new AppError(400, "App ID required");
    }

    // SUPER_ADMIN can manage all apps (legacy fallback)
    if (adminUser.role === "SUPER_ADMIN") {
      return next();
    }

    // Check via new org membership system
    const canAccess = await authzCanAccessApp(adminUser.id, appId);
    if (canAccess) {
      return next();
    }

    // Legacy fallback: check AppManager
    const assignment = await prisma.appManager.findUnique({
      where: {
        adminUserId_appId: {
          adminUserId: adminUser.id,
          appId,
        },
      },
    });

    if (assignment) {
      return next();
    }

    throw new AppError(
      403,
      "You do not have permission to access this app",
      "FORBIDDEN",
    );
  } catch (error) {
    next(error);
  }
}
