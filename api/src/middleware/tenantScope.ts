/**
 * Tenant / Org Scoping Middleware
 * Spec: "All queries must be scoped by (tenantId, appId) from auth context."
 *
 * Attaches `req.accessibleAppIds` to the request so controllers can filter
 * queries without each duplicating the resolution logic.
 *
 * Resolution:
 *   - SUPER_ADMIN: null (meaning "all apps", controller treats null as no filter)
 *   - Others: union of org-based apps + legacy AppManager apps
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";

declare global {
  namespace Express {
    interface Request {
      /**
       * IDs of apps the authenticated admin may access.
       * `null` means unrestricted (SUPER_ADMIN).
       */
      accessibleAppIds?: string[] | null;
    }
  }
}

/**
 * Resolve accessible app IDs for the current admin user
 * and attach them to the request.  Must run AFTER authenticateAdmin.
 */
export async function resolveAccessibleApps(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const adminUser = req.adminUser;

    // No admin user → skip (public / API-key route)
    if (!adminUser) {
      return next();
    }

    // SUPER_ADMIN sees everything
    if (adminUser.role === "SUPER_ADMIN") {
      req.accessibleAppIds = null;
      return next();
    }

    // Org-based apps: find orgs where user is an active member
    const memberships = await prisma.orgMember.findMany({
      where: { adminUserId: adminUser.id, isActive: true },
      select: { orgId: true },
    });
    const orgIds = memberships.map((m) => m.orgId);

    let orgAppIds: string[] = [];
    if (orgIds.length > 0) {
      const orgApps = await prisma.app.findMany({
        where: { orgId: { in: orgIds } },
        select: { id: true },
      });
      orgAppIds = orgApps.map((a) => a.id);
    }

    // Legacy AppManager-based apps
    const managerApps = await prisma.appManager.findMany({
      where: { adminUserId: adminUser.id },
      select: { appId: true },
    });
    const managerAppIds = managerApps.map((m) => m.appId);

    // Union (deduplicate)
    req.accessibleAppIds = [...new Set([...orgAppIds, ...managerAppIds])];

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Build a Prisma `where` filter for scoping queries by accessible apps.
 * Use in controllers: `prisma.app.findMany({ where: { ...scopeFilter(req), ... } })`
 */
export function appScopeFilter(req: Request): Record<string, any> {
  if (req.accessibleAppIds === null || req.accessibleAppIds === undefined) {
    // SUPER_ADMIN or non-admin route → no filter
    return {};
  }
  return { id: { in: req.accessibleAppIds } };
}

/**
 * Build a Prisma `where` filter for entities that have an `appId` column.
 */
export function appIdScopeFilter(req: Request): Record<string, any> {
  if (req.accessibleAppIds === null || req.accessibleAppIds === undefined) {
    return {};
  }
  return { appId: { in: req.accessibleAppIds } };
}

/**
 * Returns true when the request context can access the given app ID.
 * - SUPER_ADMIN / non-admin routes (`accessibleAppIds` null|undefined): true
 * - Scoped admins: appId must exist in the resolved list
 */
export function canAccessAppId(req: Request, appId: string): boolean {
  if (req.accessibleAppIds === null || req.accessibleAppIds === undefined) {
    return true;
  }
  return req.accessibleAppIds.includes(appId);
}
