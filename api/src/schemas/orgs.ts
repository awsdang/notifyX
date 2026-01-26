import { z } from 'zod';
import { registry } from '../docs/registry';
import { responseSchema } from './common';

// Create organization
export const createOrgSchema = z.object({
    name: z.string().min(1).max(100).meta({ example: 'My Organization' }),
    slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').meta({ example: 'my-organization' }),
}).register(registry, { id: 'CreateOrgRequest' });

// Create role
export const createRoleSchema = z.object({
    name: z.string().min(1).max(50).meta({ example: 'My Role' }),
    permissions: z.array(z.string()).min(1).meta({ example: ['permission-1', 'permission-2'] }),
}).register(registry, { id: 'CreateRoleRequest' });

// Update role
export const updateRoleSchema = z.object({
    name: z.string().min(1).max(50).optional().meta({ example: 'My Role' }),
    permissions: z.array(z.string()).min(1).optional().meta({ example: ['permission-1', 'permission-2'] }),
}).register(registry, { id: 'UpdateRoleRequest' });

// Add member
export const addMemberSchema = z.object({
    adminUserId: z.uuid().meta({ example: 'admin-user-id' }),
    roleId: z.uuid().meta({ example: 'role-id' }),
}).register(registry, { id: 'AddMemberRequest' });

// Update member
export const updateMemberSchema = z.object({
    roleId: z.uuid().optional().meta({ example: 'role-id' }),
    isActive: z.boolean().optional().meta({ example: true }),
}).register(registry, { id: 'UpdateMemberRequest' });

// Environment schemas
export const createEnvironmentSchema = z.object({
    env: z.enum(['UAT', 'PROD']).meta({ example: 'UAT' }),
}).register(registry, { id: 'CreateEnvironmentRequest' });

export const updateEnvironmentSchema = z.object({
    isEnabled: z.boolean().meta({ example: true }),
}).register(registry, { id: 'UpdateEnvironmentRequest' });

// App policy schema
export const updatePolicySchema = z.object({
    allowCsv: z.boolean().optional().meta({ example: true }),
    allowSegments: z.boolean().optional().meta({ example: true }),
    allowHighPriorityCampaigns: z.boolean().optional().meta({ example: true }),
    csvMaxSizeBytes: z.number().int().positive().optional().meta({ example: 1024 }),
    imageMaxSizeBytes: z.number().int().positive().optional().meta({ example: 1024 }),
}).register(registry, { id: 'UpdatePolicyRequest' });

// Model Schemas
export const orgSchema = z.object({
    id: z.uuid().meta({ example: 'org-id' }),
    name: z.string().meta({ example: 'Organization Name' }),
    slug: z.string().meta({ example: 'organization-slug' }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
    updatedAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
})

export const roleSchema = z.object({
    id: z.uuid().meta({ example: 'role-id' }),
    name: z.string().meta({ example: 'Role Name' }),
    isSystem: z.boolean().meta({ example: false }),
    permissions: z.array(z.string()).meta({ example: ['permission-1', 'permission-2'] }),
    memberCount: z.number().optional().meta({ example: 1 }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
})

export const memberSchema = z.object({
    id: z.uuid().meta({ example: 'member-id' }),
    adminUser: z.object({
        id: z.uuid().meta({ example: 'admin-user-id' }),
        email: z.string().email().meta({ example: 'admin-user@example.com' }),
        name: z.string().meta({ example: 'Admin User' }),
    }),
    role: z.object({
        id: z.uuid().meta({ example: 'role-id' }),
        name: z.string().meta({ example: 'Role Name' }),
    }),
    isActive: z.boolean().meta({ example: true }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
})

export const permissionSchema = z.object({
    id: z.uuid().meta({ example: 'permission-id' }),
    key: z.string().meta({ example: 'permission-key' }),
    description: z.string().meta({ example: 'Permission Description' }),
})

// Response Schemas
export const orgResponseSchema = responseSchema(orgSchema).register(registry, { id: 'OrgResponse' });
export const orgListResponseSchema = responseSchema(z.array(orgSchema.extend({
    memberCount: z.number().optional().meta({ example: 1 }),
    appCount: z.number().optional().meta({ example: 1 }),
}))).register(registry, { id: 'OrgListResponse' });

export const roleResponseSchema = responseSchema(roleSchema).register(registry, { id: 'RoleResponse' });
export const roleListResponseSchema = responseSchema(z.array(roleSchema)).register(registry, { id: 'RoleListResponse' });

export const memberResponseSchema = responseSchema(memberSchema).register(registry, { id: 'MemberResponse' });
export const permissionListResponseSchema = responseSchema(z.array(permissionSchema)).register(registry, { id: 'PermissionListResponse' });
