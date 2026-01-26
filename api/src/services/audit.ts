import { prisma } from './database';
import type { AuditAction, AuditResource, AuditLogEntry } from '../interfaces/services/audit';

export type { AuditAction, AuditResource, AuditLogEntry };

export async function logAudit(entry: AuditLogEntry): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                adminUserId: entry.adminUserId,
                action: entry.action,
                resource: entry.resource,
                resourceId: entry.resourceId,
                appId: entry.appId,
                details: entry.details ?? {},
                ipAddress: entry.ipAddress,
                userAgent: entry.userAgent,
            },
        });
    } catch (error) {
        console.error('[Audit] Failed to log audit entry:', error);
    }
}

export async function getAuditLogs(options: {
    adminUserId?: string;
    action?: AuditAction;
    resource?: AuditResource;
    resourceId?: string;
    appId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}): Promise<{ logs: any[]; total: number }> {
    const where: any = {};

    if (options.adminUserId) where.adminUserId = options.adminUserId;
    if (options.action) where.action = options.action;
    if (options.resource) where.resource = options.resource;
    if (options.resourceId) where.resourceId = options.resourceId;
    if (options.appId) where.appId = options.appId;

    if (options.startDate || options.endDate) {
        where.createdAt = {};
        if (options.startDate) where.createdAt.gte = options.startDate;
        if (options.endDate) where.createdAt.lte = options.endDate;
    }

    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: options.limit || 50,
            skip: options.offset || 0,
            include: {
                adminUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
        }),
        prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
}

export function extractRequestInfo(req: any): { ipAddress?: string; userAgent?: string } {
    return {
        ipAddress: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers?.['user-agent'],
    };
}
