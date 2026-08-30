/**
 * Authorization Service
 * Centralized permission checking for fine-grained RBAC
 */

import { prisma } from './database';
import { AppError } from '../utils/response';

export interface AuthContext {
    adminUserId: string;
    orgId?: string;
    appId?: string;
    /** Legacy AdminRole of the caller (SUPER_ADMIN / APP_MANAGER / MARKETING_MANAGER) */
    role?: string;
}

/**
 * Get all permission keys for an admin user across all org memberships
 */
export async function getUserPermissions(adminUserId: string): Promise<string[]> {
    const memberships = await prisma.orgMember.findMany({
        where: {
            adminUserId,
            isActive: true,
        },
        include: {
            role: {
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            },
        },
    });

    const permissionSet = new Set<string>();
    for (const membership of memberships) {
        for (const rp of membership.role.permissions) {
            permissionSet.add(rp.permission.key);
        }
    }

    return Array.from(permissionSet);
}

/**
 * Get permissions for a user within a specific organization
 */
export async function getUserOrgPermissions(adminUserId: string, orgId: string): Promise<string[]> {
    const membership = await prisma.orgMember.findUnique({
        where: {
            orgId_adminUserId: { orgId, adminUserId },
        },
        include: {
            role: {
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            },
        },
    });

    if (!membership || !membership.isActive) {
        return [];
    }

    return membership.role.permissions.map(rp => rp.permission.key);
}

/**
 * Get all org IDs where user is an active member
 */
export async function getUserOrgIds(adminUserId: string): Promise<string[]> {
    const memberships = await prisma.orgMember.findMany({
        where: {
            adminUserId,
            isActive: true,
        },
        select: {
            orgId: true,
        },
    });

    return memberships.map(m => m.orgId);
}

/**
 * Check if user can access an app via org membership
 */
export async function canAccessApp(adminUserId: string, appId: string): Promise<boolean> {
    // Get the app's org
    const app = await prisma.app.findUnique({
        where: { id: appId },
        select: { orgId: true },
    });

    if (!app) {
        return false;
    }

    // If app has no org, fall back to legacy AppManager check
    if (!app.orgId) {
        const manager = await prisma.appManager.findUnique({
            where: {
                adminUserId_appId: { adminUserId, appId },
            },
        });
        return !!manager;
    }

    // Check if user is member of the app's org
    const membership = await prisma.orgMember.findUnique({
        where: {
            orgId_adminUserId: { orgId: app.orgId, adminUserId },
        },
    });

    return !!(membership && membership.isActive);
}

/**
 * Resolve the effective permission set for an auth context.
 *
 * Two grant systems coexist:
 *   1. Fine-grained RBAC via Organization -> Role -> Permission.
 *   2. Legacy per-app assignments in `AppManager`, where the caller's
 *      `AdminRole` implies a fixed permission set (see LEGACY_ROLE_PERMISSIONS).
 *
 * Apps created before/outside the org system have `orgId = null` and are
 * granted purely through `AppManager`, so an APP_MANAGER would otherwise
 * resolve to an empty permission set and be locked out of their own apps.
 */
async function resolvePermissions(ctx: AuthContext): Promise<string[]> {
    if (ctx.orgId) {
        // Org-level operations are RBAC-only; legacy roles carry no org rights.
        return getUserOrgPermissions(ctx.adminUserId, ctx.orgId);
    }

    if (ctx.appId) {
        const app = await prisma.app.findUnique({
            where: { id: ctx.appId },
            select: { orgId: true },
        });

        // `ctx.appId` only counts when it really is an app id — several routes
        // pass a campaign/credential id in the same param, which falls through
        // to the account-wide resolution below.
        if (app) {
            const permissions = new Set<string>();

            if (app.orgId) {
                for (const key of await getUserOrgPermissions(ctx.adminUserId, app.orgId)) {
                    permissions.add(key);
                }
            }

            const legacyAssignment = await prisma.appManager.findUnique({
                where: {
                    adminUserId_appId: { adminUserId: ctx.adminUserId, appId: ctx.appId },
                },
                select: { id: true },
            });

            if (legacyAssignment) {
                for (const key of legacyRolePermissions(ctx.role)) {
                    permissions.add(key);
                }
            }

            return Array.from(permissions);
        }
    }

    // No resolvable app context: union of every org membership plus the
    // caller's legacy role defaults. Handlers are responsible for scoping the
    // resource itself (see `canAccessAppId`).
    const permissions = new Set<string>(await getUserPermissions(ctx.adminUserId));
    for (const key of legacyRolePermissions(ctx.role)) {
        permissions.add(key);
    }
    return Array.from(permissions);
}

/**
 * Assert user has a specific permission
 * Throws AppError(403) if permission is missing
 */
export async function assertCan(permission: string, ctx: AuthContext): Promise<void> {
    const permissions = await resolvePermissions(ctx);

    if (!permissions.includes(permission)) {
        throw new AppError(403, `Permission denied: ${permission}`, 'FORBIDDEN');
    }
}

/**
 * Assert user has ALL of the specified permissions
 * Throws AppError(403) if any permission is missing
 */
export async function assertCanAll(permissions: string[], ctx: AuthContext): Promise<void> {
    for (const permission of permissions) {
        await assertCan(permission, ctx);
    }
}

/**
 * Assert user has at least ONE of the specified permissions
 * Throws AppError(403) if all permissions are missing
 */
export async function assertCanAny(permissions: string[], ctx: AuthContext): Promise<void> {
    const userPermissions = await resolvePermissions(ctx);

    const hasAny = permissions.some(p => userPermissions.includes(p));

    if (!hasAny) {
        throw new AppError(403, `Permission denied: requires one of [${permissions.join(', ')}]`, 'FORBIDDEN');
    }
}

/**
 * Check if user has a specific permission (non-throwing version)
 */
export async function hasPerm(permission: string, ctx: AuthContext): Promise<boolean> {
    try {
        await assertCan(permission, ctx);
        return true;
    } catch {
        return false;
    }
}

/**
 * Permission keys as constants for type safety
 */
export const PERMISSIONS = {
    // Organization
    ORG_CREATE: 'org:create',
    ORG_UPDATE: 'org:update',

    // App
    APP_CREATE: 'app:create',
    APP_UPDATE: 'app:update',
    APP_KILL: 'app:kill',

    // Environment
    ENV_MANAGE: 'env:manage',

    // Credentials
    CREDENTIAL_READ: 'credential:read',
    CREDENTIAL_WRITE: 'credential:write',
    CREDENTIAL_TEST: 'credential:test',
    CREDENTIAL_ROTATE: 'credential:rotate',

    // Templates
    TEMPLATE_CREATE: 'template:create',
    TEMPLATE_UPDATE: 'template:update',
    TEMPLATE_DELETE: 'template:delete',

    // Campaigns
    CAMPAIGN_CREATE: 'campaign:create',
    CAMPAIGN_UPDATE: 'campaign:update',
    CAMPAIGN_SUBMIT_REVIEW: 'campaign:submit_review',
    CAMPAIGN_APPROVE: 'campaign:approve',
    CAMPAIGN_SEND: 'campaign:send',
    CAMPAIGN_CANCEL: 'campaign:cancel',

    // Audience
    AUDIENCE_UPLOAD_CSV: 'audience:upload_csv',
    AUDIENCE_USE_SEGMENT: 'audience:use_segment',

    // Devices
    DEVICE_SEARCH: 'device:search',
    DEVICE_DEACTIVATE: 'device:deactivate',
    DEVICE_BULK_DEACTIVATE_USER: 'device:bulk_deactivate_user',

    // Audit
    AUDIT_READ: 'audit:read',
    AUDIT_EXPORT: 'audit:export',

    // Stats
    STATS_READ: 'stats:read',
    STATS_EXPORT: 'stats:export',

    // Webhooks
    WEBHOOK_CONFIGURE: 'webhook:configure',
    WEBHOOK_ROTATE_SECRET: 'webhook:rotate_secret',

    // Operations
    OPS_REPLAY: 'ops:replay',

    // A/B Tests
    ABTEST_CREATE: 'abtest:create',
    ABTEST_START: 'abtest:start',
    ABTEST_EVALUATE: 'abtest:evaluate',
    ABTEST_ROLLOUT: 'abtest:rollout',
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Permissions implied by the legacy `AdminRole` for apps granted through
 * `AppManager` (i.e. apps with no organization). SUPER_ADMIN is not listed —
 * it bypasses permission checks entirely in the middleware.
 *
 * These mirror the role guards already used on the non-RBAC routes
 * (`requireManager` / `requireMarketing`), so a legacy APP_MANAGER keeps the
 * same reach on RBAC-guarded routes as they have everywhere else.
 */
const LEGACY_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
    APP_MANAGER: [
        PERMISSIONS.APP_CREATE,
        PERMISSIONS.APP_UPDATE,
        PERMISSIONS.ENV_MANAGE,
        PERMISSIONS.CREDENTIAL_READ,
        PERMISSIONS.CREDENTIAL_WRITE,
        PERMISSIONS.CREDENTIAL_TEST,
        PERMISSIONS.CREDENTIAL_ROTATE,
        PERMISSIONS.TEMPLATE_CREATE,
        PERMISSIONS.TEMPLATE_UPDATE,
        PERMISSIONS.TEMPLATE_DELETE,
        PERMISSIONS.CAMPAIGN_CREATE,
        PERMISSIONS.CAMPAIGN_UPDATE,
        PERMISSIONS.CAMPAIGN_SUBMIT_REVIEW,
        PERMISSIONS.CAMPAIGN_APPROVE,
        PERMISSIONS.CAMPAIGN_SEND,
        PERMISSIONS.CAMPAIGN_CANCEL,
        PERMISSIONS.AUDIENCE_UPLOAD_CSV,
        PERMISSIONS.AUDIENCE_USE_SEGMENT,
        PERMISSIONS.DEVICE_SEARCH,
        PERMISSIONS.DEVICE_DEACTIVATE,
        PERMISSIONS.DEVICE_BULK_DEACTIVATE_USER,
        PERMISSIONS.AUDIT_READ,
        PERMISSIONS.AUDIT_EXPORT,
        PERMISSIONS.STATS_READ,
        PERMISSIONS.STATS_EXPORT,
        PERMISSIONS.WEBHOOK_CONFIGURE,
        PERMISSIONS.WEBHOOK_ROTATE_SECRET,
        PERMISSIONS.OPS_REPLAY,
        PERMISSIONS.ABTEST_CREATE,
        PERMISSIONS.ABTEST_START,
        PERMISSIONS.ABTEST_EVALUATE,
        PERMISSIONS.ABTEST_ROLLOUT,
    ],
    MARKETING_MANAGER: [
        PERMISSIONS.TEMPLATE_CREATE,
        PERMISSIONS.TEMPLATE_UPDATE,
        PERMISSIONS.TEMPLATE_DELETE,
        PERMISSIONS.CAMPAIGN_CREATE,
        PERMISSIONS.CAMPAIGN_UPDATE,
        PERMISSIONS.CAMPAIGN_SUBMIT_REVIEW,
        PERMISSIONS.AUDIENCE_UPLOAD_CSV,
        PERMISSIONS.AUDIENCE_USE_SEGMENT,
        PERMISSIONS.DEVICE_SEARCH,
        PERMISSIONS.STATS_READ,
        PERMISSIONS.ABTEST_CREATE,
    ],
};

/**
 * Permission keys implied by a legacy `AdminRole`. Empty for unknown roles
 * and for SUPER_ADMIN (handled by the middleware bypass).
 */
export function legacyRolePermissions(role?: string): readonly string[] {
    if (!role) return [];
    return LEGACY_ROLE_PERMISSIONS[role] ?? [];
}
