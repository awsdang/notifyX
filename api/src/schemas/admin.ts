import { z } from 'zod';
import { registry } from '../docs/registry';
import { responseSchema } from './common';

// Validation schemas
export const loginSchema = z.object({
    email: z.email().meta({ example: 'user@example.com' }),
    password: z.string().min(8).meta({ example: 'password' }),
}).register(registry, { id: 'LoginRequest' });

export const registerSchema = z.object({
    email: z.email().meta({ example: 'user@example.com' }),
    password: z.string().min(8).meta({ example: 'password' }),
    name: z.string().min(2).meta({ example: 'John Doe' }),
    role: z.enum(['SUPER_ADMIN', 'APP_MANAGER', 'MARKETING_MANAGER']).optional().meta({ example: 'SUPER_ADMIN' }),
}).register(registry, { id: 'RegisterRequest' });

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(8).meta({ example: 'password' }),
    newPassword: z.string().min(8).meta({ example: 'password' }),
}).register(registry, { id: 'ChangePasswordRequest' });

// Model Schemas
export const adminUserSchema = z.object({
    id: z.uuid().meta({ example: 'user-xyz' }),
    email: z.email().meta({ example: 'user@example.com' }),
    name: z.string().meta({ example: 'John Doe' }),
    role: z.enum(['SUPER_ADMIN', 'APP_MANAGER', 'MARKETING_MANAGER']).meta({ example: 'SUPER_ADMIN' }),
    isActive: z.boolean().meta({ example: true }),
    lastLoginAt: z.iso.datetime().nullable().meta({ example: '2024-01-01T12:00:00Z' }),
    createdAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
})

// Response Schemas
export const loginResponseSchema = responseSchema(z.object({
    token: z.string().meta({ example: 'token' }),
    expiresAt: z.iso.datetime().meta({ example: '2024-01-01T12:00:00Z' }),
    user: z.object({
        id: z.uuid().meta({ example: 'user-xyz' }),
        email: z.email().meta({ example: 'user@example.com' }),
        name: z.string().meta({ example: 'John Doe' }),
        role: z.enum(['SUPER_ADMIN', 'APP_MANAGER', 'MARKETING_MANAGER']).meta({ example: 'SUPER_ADMIN' }),
    }),
})).register(registry, { id: 'LoginResponse' });

export const meResponseSchema = responseSchema(z.object({
    id: z.uuid().meta({ example: 'user-xyz' }),
    email: z.string().email().meta({ example: 'user@example.com' }),
    name: z.string().meta({ example: 'John Doe' }),
    role: z.enum(['SUPER_ADMIN', 'APP_MANAGER', 'MARKETING_MANAGER']).meta({ example: 'SUPER_ADMIN' }),
    managedApps: z.array(z.uuid()).meta({ example: ['app-xyz'] }),
})).register(registry, { id: 'MeResponse' });

export const adminUserResponseSchema = responseSchema(adminUserSchema).register(registry, { id: 'AdminUserResponse' });
export const adminUserListResponseSchema = responseSchema(z.array(adminUserSchema).meta({ example: [{ id: 'user-xyz', email: 'user@example.com', name: 'John Doe', role: 'SUPER_ADMIN', managedApps: ['app-xyz'] }] })).register(registry, { id: 'AdminUserListResponse' });

export const assignmentResponseSchema = responseSchema(z.object({
    id: z.uuid().meta({ example: 'assignment-xyz' }),
    appId: z.uuid().meta({ example: 'app-xyz' }),
    adminUser: z.object({ email: z.string().email().meta({ example: 'user@example.com' }), name: z.string().meta({ example: 'John Doe' }) }),
    app: z.object({ name: z.string().meta({ example: 'My App' }) }),
})).register(registry, { id: 'AssignmentResponse' });


