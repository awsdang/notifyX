/**
 * Organizations Controller
 * Handles organization, role, and member management
 */

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { sendSuccess, AppError } from '../utils/response';
import { logAudit } from '../services/audit';
import {
    createOrgSchema,
    createRoleSchema,
    updateRoleSchema,
    addMemberSchema,
    updateMemberSchema,
} from '../schemas/orgs';

/**
 * Create a new organization
 * POST /v1/admin/orgs
 */
export async function createOrg(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const adminUser = req.adminUser!;
        const data = createOrgSchema.parse(req.body);

        // Check if slug already exists
        const existing = await prisma.organization.findUnique({
            where: { slug: data.slug },
        });

        if (existing) {
            throw new AppError(409, 'Organization with this slug already exists', 'SLUG_CONFLICT');
        }

        // Create organization with transaction to also create default roles
        const org = await prisma.$transaction(async (tx) => {
            // Create organization
            const newOrg = await tx.organization.create({
                data: {
                    name: data.name,
                    slug: data.slug,
                },
            });

            // Get all permissions for creating system roles
            const allPermissions = await tx.permission.findMany();
            const permissionMap = new Map(allPermissions.map(p => [p.key, p.id]));

            // Create default system roles
            const adminRole = await tx.role.create({
                data: {
                    orgId: newOrg.id,
                    name: 'Admin',
                    isSystem: true,
                },
            });

            // Admin gets all permissions
            if (allPermissions.length > 0) {
                await tx.rolePermission.createMany({
                    data: allPermissions.map(p => ({
                        roleId: adminRole.id,
                        permissionId: p.id,
                    })),
                });
            }

            // Create Manager role with subset of permissions
            const managerRole = await tx.role.create({
                data: {
                    orgId: newOrg.id,
                    name: 'Manager',
                    isSystem: true,
                },
            });

            const managerPermKeys = [
                'app:create', 'app:update',
                'env:manage',
                'credential:read', 'credential:write', 'credential:test',
                'template:create', 'template:update', 'template:delete',
                'campaign:create', 'campaign:update', 'campaign:submit_review',
                'device:search', 'device:deactivate',
                'audit:read',
                'stats:read',
                'webhook:configure',
            ];

            const managerPermIds = managerPermKeys
                .map(key => permissionMap.get(key))
                .filter((id): id is string => !!id);

            if (managerPermIds.length > 0) {
                await tx.rolePermission.createMany({
                    data: managerPermIds.map(permissionId => ({
                        roleId: managerRole.id,
                        permissionId,
                    })),
                });
            }

            // Create Marketing role
            const marketingRole = await tx.role.create({
                data: {
                    orgId: newOrg.id,
                    name: 'Marketing',
                    isSystem: true,
                },
            });

            const marketingPermKeys = [
                'template:create', 'template:update',
                'campaign:create', 'campaign:update', 'campaign:submit_review',
                'audience:upload_csv', 'audience:use_segment',
                'stats:read',
                'abtest:create', 'abtest:start',
            ];

            const marketingPermIds = marketingPermKeys
                .map(key => permissionMap.get(key))
                .filter((id): id is string => !!id);

            if (marketingPermIds.length > 0) {
                await tx.rolePermission.createMany({
                    data: marketingPermIds.map(permissionId => ({
                        roleId: marketingRole.id,
                        permissionId,
                    })),
                });
            }

            // Add the creating user as an admin of the org
            await tx.orgMember.create({
                data: {
                    orgId: newOrg.id,
                    adminUserId: adminUser.id,
                    roleId: adminRole.id,
                    isActive: true,
                },
            });

            // Log audit
            await logAudit({
                adminUserId: adminUser.id,
                action: 'ORG_CREATED',
                resource: 'organization',
                resourceId: newOrg.id,
                details: { name: data.name, slug: data.slug },
            });

            return newOrg;
        });

        sendSuccess(res, {
            id: org.id,
            name: org.name,
            slug: org.slug,
            createdAt: org.createdAt,
        }, 201);
    } catch (error) {
        next(error);
    }
}

/**
 * List organizations where user is a member
 * GET /v1/admin/orgs
 */
export async function getOrgs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const adminUser = req.adminUser!;

        const memberships = await prisma.orgMember.findMany({
            where: {
                adminUserId: adminUser.id,
                isActive: true,
            },
            include: {
                org: {
                    include: {
                        _count: {
                            select: { members: true, apps: true },
                        },
                    },
                },
            },
        });

        const orgs = memberships.map(m => ({
            id: m.org.id,
            name: m.org.name,
            slug: m.org.slug,
            memberCount: m.org._count.members,
            appCount: m.org._count.apps,
            createdAt: m.org.createdAt,
        }));

        sendSuccess(res, orgs);
    } catch (error) {
        next(error);
    }
}

/**
 * Create a new role in an organization
 * POST /v1/admin/orgs/:orgId/roles
 */
export async function createRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const adminUser = req.adminUser!;
        const { orgId } = req.params as { orgId: string };
        const data = createRoleSchema.parse(req.body);

        // Verify org exists
        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (!org) {
            throw new AppError(404, 'Organization not found');
        }

        // Check if role name already exists in org
        const existing = await prisma.role.findUnique({
            where: { orgId_name: { orgId, name: data.name } },
        });
        if (existing) {
            throw new AppError(409, 'Role with this name already exists in the organization');
        }

        // Validate all permission keys exist
        const permissions = await prisma.permission.findMany({
            where: { key: { in: data.permissions } },
        });

        if (permissions.length !== data.permissions.length) {
            const foundKeys = new Set(permissions.map(p => p.key));
            const invalidKeys = data.permissions.filter(k => !foundKeys.has(k));
            throw new AppError(400, `Invalid permission keys: ${invalidKeys.join(', ')}`);
        }

        // Create role with permissions
        const role = await prisma.$transaction(async (tx) => {
            const newRole = await tx.role.create({
                data: {
                    orgId,
                    name: data.name,
                    isSystem: false,
                },
            });

            if (permissions.length > 0) {
                await tx.rolePermission.createMany({
                    data: permissions.map(p => ({
                        roleId: newRole.id,
                        permissionId: p.id,
                    })),
                });
            }

            await logAudit({
                adminUserId: adminUser.id,
                action: 'ROLE_CREATED',
                resource: 'role',
                resourceId: newRole.id,
                details: { name: data.name, permissions: data.permissions, orgId },
            });

            return newRole;
        });

        sendSuccess(res, {
            id: role.id,
            name: role.name,
            isSystem: role.isSystem,
            permissions: data.permissions,
        }, 201);
    } catch (error) {
        next(error);
    }
}

/**
 * List roles in an organization
 * GET /v1/admin/orgs/:orgId/roles
 */
export async function getRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { orgId } = req.params as { orgId: string };

        const roles = await prisma.role.findMany({
            where: { orgId },
            include: {
                permissions: {
                    include: { permission: true },
                },
                _count: { select: { members: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        const result = roles.map(role => ({
            id: role.id,
            name: role.name,
            isSystem: role.isSystem,
            permissions: role.permissions.map(rp => rp.permission.key),
            memberCount: role._count.members,
            createdAt: role.createdAt,
        }));

        sendSuccess(res, result);
    } catch (error) {
        next(error);
    }
}

/**
 * Update a role
 * PUT /v1/admin/orgs/:orgId/roles/:roleId
 */
export async function updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const adminUser = req.adminUser!;
        const { orgId, roleId } = req.params as { orgId: string; roleId: string };
        const data = updateRoleSchema.parse(req.body);

        // Find role
        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (!role || role.orgId !== orgId) {
            throw new AppError(404, 'Role not found');
        }

        // Cannot modify system roles
        if (role.isSystem) {
            throw new AppError(403, 'System roles cannot be modified');
        }

        await prisma.$transaction(async (tx) => {
            // Update name if provided
            if (data.name) {
                const existing = await tx.role.findFirst({
                    where: { orgId, name: data.name, id: { not: roleId } },
                });
                if (existing) {
                    throw new AppError(409, 'Role with this name already exists');
                }

                await tx.role.update({
                    where: { id: roleId },
                    data: { name: data.name },
                });
            }

            // Update permissions if provided
            if (data.permissions) {
                const permissions = await tx.permission.findMany({
                    where: { key: { in: data.permissions } },
                });

                if (permissions.length !== data.permissions.length) {
                    const foundKeys = new Set(permissions.map(p => p.key));
                    const invalidKeys = data.permissions.filter(k => !foundKeys.has(k));
                    throw new AppError(400, `Invalid permission keys: ${invalidKeys.join(', ')}`);
                }

                // Remove existing permissions and add new ones
                await tx.rolePermission.deleteMany({ where: { roleId } });
                await tx.rolePermission.createMany({
                    data: permissions.map(p => ({
                        roleId,
                        permissionId: p.id,
                    })),
                });
            }

            await logAudit({
                adminUserId: adminUser.id,
                action: 'ROLE_UPDATED',
                resource: 'role',
                resourceId: roleId,
                details: { ...data, orgId },
            });
        });

        // Fetch updated role
        const updated = await prisma.role.findUnique({
            where: { id: roleId },
            include: {
                permissions: { include: { permission: true } },
            },
        });

        sendSuccess(res, {
            id: updated!.id,
            name: updated!.name,
            isSystem: updated!.isSystem,
            permissions: updated!.permissions.map(rp => rp.permission.key),
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Add a member to an organization
 * POST /v1/admin/orgs/:orgId/members
 */
export async function addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const currentUser = req.adminUser!;
        const { orgId } = req.params as { orgId: string };
        const data = addMemberSchema.parse(req.body);

        // Verify org exists
        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        if (!org) {
            throw new AppError(404, 'Organization not found');
        }

        // Verify role exists and belongs to org
        const role = await prisma.role.findUnique({ where: { id: data.roleId } });
        if (!role || role.orgId !== orgId) {
            throw new AppError(404, 'Role not found');
        }

        // Verify admin user exists
        const adminUser = await prisma.adminUser.findUnique({ where: { id: data.adminUserId } });
        if (!adminUser) {
            throw new AppError(404, 'Admin user not found');
        }

        // Check if already a member
        const existing = await prisma.orgMember.findUnique({
            where: { orgId_adminUserId: { orgId, adminUserId: data.adminUserId } },
        });
        if (existing) {
            throw new AppError(409, 'User is already a member of this organization');
        }

        const member = await prisma.orgMember.create({
            data: {
                orgId,
                adminUserId: data.adminUserId,
                roleId: data.roleId,
                isActive: true,
            },
            include: {
                adminUser: { select: { id: true, email: true, name: true } },
                role: { select: { id: true, name: true } },
            },
        });

        await logAudit({
            adminUserId: currentUser.id,
            action: 'MEMBER_ADDED',
            resource: 'org_member',
            resourceId: member.id,
            details: { orgId, adminUserId: data.adminUserId, roleId: data.roleId },
        });

        sendSuccess(res, {
            id: member.id,
            adminUser: member.adminUser,
            role: member.role,
            isActive: member.isActive,
            createdAt: member.createdAt,
        }, 201);
    } catch (error) {
        next(error);
    }
}

/**
 * Update a member's role or status
 * PUT /v1/admin/orgs/:orgId/members/:memberId
 */
/**
 * Update a member's role or status
 * PUT /v1/admin/orgs/:orgId/members/:memberId
 */
export async function updateMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const currentUser = req.adminUser!;
        const { orgId, memberId } = req.params as { orgId: string; memberId: string };
        const data = updateMemberSchema.parse(req.body);

        // Find member
        const member = await prisma.orgMember.findUnique({
            where: { id: memberId },
            include: { adminUser: true },
        });
        if (!member || member.orgId !== orgId) {
            throw new AppError(404, 'Member not found');
        }

        // If updating role, verify it exists and belongs to org
        if (data.roleId) {
            const role = await prisma.role.findUnique({ where: { id: data.roleId } });
            if (!role || role.orgId !== orgId) {
                throw new AppError(404, 'Role not found');
            }
        }

        // We use a transaction or just update. The errors were about 'updated' not having adminUser/role types.
        // This is strictly because of how TypeScript infers the result of update with include.
        // We will assert the type or ensure include is correct.

        const updated = await prisma.orgMember.update({
            where: { id: memberId },
            data: {
                roleId: data.roleId,
                isActive: data.isActive,
            },
            include: {
                adminUser: { select: { id: true, email: true, name: true } },
                role: { select: { id: true, name: true } },
            },
        });

        await logAudit({
            adminUserId: currentUser.id,
            action: 'MEMBER_UPDATED',
            resource: 'org_member',
            resourceId: memberId,
            details: { ...data, orgId },
        });

        sendSuccess(res, {
            id: updated.id,
            adminUser: updated.adminUser,
            role: updated.role,
            isActive: updated.isActive,
            createdAt: updated.createdAt,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * List all available permissions
 * GET /v1/admin/permissions
 */
export async function listPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const permissions = await prisma.permission.findMany({
            orderBy: { key: 'asc' },
        });

        sendSuccess(res, permissions);
    } catch (error) {
        next(error);
    }
}
