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
 * Assert user has a specific permission
 * Throws AppError(403) if permission is missing
 */
export async function assertCan(permission: string, ctx: AuthContext): Promise<void> {
    // Get permissions based on context
    let permissions: string[];

    if (ctx.orgId) {
        permissions = await getUserOrgPermissions(ctx.adminUserId, ctx.orgId);
    } else if (ctx.appId) {
        // Get org from app
        const app = await prisma.app.findUnique({
            where: { id: ctx.appId },
            select: { orgId: true },
        });

        if (app?.orgId) {
            permissions = await getUserOrgPermissions(ctx.adminUserId, app.orgId);
        } else {
            // Legacy behavior: use all permissions
            permissions = await getUserPermissions(ctx.adminUserId);
        }
    } else {
        permissions = await getUserPermissions(ctx.adminUserId);
    }

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
    let userPermissions: string[];

    if (ctx.orgId) {
        userPermissions = await getUserOrgPermissions(ctx.adminUserId, ctx.orgId);
    } else if (ctx.appId) {
        const app = await prisma.app.findUnique({
            where: { id: ctx.appId },
            select: { orgId: true },
        });

        if (app?.orgId) {
            userPermissions = await getUserOrgPermissions(ctx.adminUserId, app.orgId);
        } else {
            userPermissions = await getUserPermissions(ctx.adminUserId);
        }
    } else {
        userPermissions = await getUserPermissions(ctx.adminUserId);
    }

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
