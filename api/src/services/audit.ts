import { prisma } from './database';

export type AuditAction =
    | 'APP_CREATED'
    | 'APP_UPDATED'
    | 'APP_KILLED'
    | 'APP_REVIVED'
    | 'CAMPAIGN_CREATED'
    | 'CAMPAIGN_UPDATED'
    | 'CAMPAIGN_SCHEDULED'
    | 'CAMPAIGN_SENT'
    | 'CAMPAIGN_CANCELLED'
    | 'CAMPAIGN_DELETED'
    | 'CAMPAIGN_DUPLICATED'
    | 'ABTEST_CREATED'
    | 'ABTEST_UPDATED'
    | 'ABTEST_STARTED'
    | 'ABTEST_CANCELLED'
    | 'ABTEST_DELETED'
    | 'ABTEST_DUPLICATED'
    | 'TEMPLATE_CREATED'
    | 'TEMPLATE_UPDATED'
    | 'TEMPLATE_DELETED'
    | 'NOTIFICATION_CREATED'
    | 'NOTIFICATION_SCHEDULED'
    | 'NOTIFICATION_CANCELLED'
    | 'NOTIFICATION_FORCE_SENT'
    | 'NOTIFICATION_TEST_SENT'
    | 'CREDENTIAL_SET'
    | 'CREDENTIAL_DELETED'
    | 'CREDENTIAL_TOGGLED'
    | 'USER_CREATED'
    | 'USER_DELETED'
    | 'DEVICE_DEACTIVATED'
    | 'ADMIN_LOGIN'
    | 'ADMIN_LOGOUT'
    | 'ADMIN_CREATED'
    | 'ADMIN_UPDATED'
    | 'ADMIN_PASSWORD_CHANGED'
    | 'WEBHOOK_TRIGGERED'
    | 'WEBHOOK_FAILED'
    | 'FILE_UPLOADED'
    | 'CREDENTIAL_VERSION_CREATED'
    | 'CREDENTIAL_TESTED'
    | 'CREDENTIAL_ACTIVATED'
    | 'CREDENTIAL_DEACTIVATED'
    | 'WEBHOOK_CREATED'
    | 'WEBHOOK_UPDATED'
    | 'WEBHOOK_SECRET_ROTATED'
    | 'ORG_CREATED'
    | 'ROLE_CREATED'
    | 'ROLE_UPDATED'
    | 'ROLE_DELETED'
    | 'MEMBER_ADDED'
    | 'MEMBER_UPDATED'
    | 'MEMBER_REMOVED';

export type AuditResource =
    | 'app'
    | 'campaign'
    | 'abtest'
    | 'template'
    | 'notification'
    | 'credential'
    | 'user'
    | 'device'
    | 'admin'
    | 'webhook'
    | 'storage'
    | 'credential_version'
    | 'credential_test_run'
    | 'webhook_endpoint'
    | 'organization'
    | 'role'
    | 'org_member';

interface AuditLogEntry {
    adminUserId?: string;
    action: AuditAction;
    resource: AuditResource;
    resourceId?: string;
    appId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
}

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
