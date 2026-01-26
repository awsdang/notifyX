/**
 * Reports Controller
 * Aggregates data for campaigns, provider health, and troubleshooting
 */

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { sendSuccess, AppError } from '../utils/response';

export const getCampaignReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const campaign = await prisma.campaign.findUnique({
            where: { id: String(id) },
            include: {
                approvals: true,
            }
        });

        if (!campaign) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        // Aggregate delivery stats
        const notifications = await prisma.notification.findMany({
            where: { campaignId: String(id) },
            select: { id: true }
        });
        const notificationIds = notifications.map(n => n.id);

        const deliveryStats = await prisma.notificationDelivery.groupBy({
            by: ['status', 'provider', 'failureCategory'] as const,
            where: { notificationId: { in: notificationIds } },
            _count: true
        });

        // Computed totals
        let sent = 0;
        let delivered = 0;
        let failed = 0;
        const failureCategories: Record<string, number> = {};
        const byProvider: Record<string, number> = {};

        (deliveryStats as any[]).forEach(stat => {
            const count = stat._count as number;
            if (stat.status === 'SENT') sent += count;
            if (stat.status === 'DELIVERED') {
                sent += count;
                delivered += count;
            }
            if (stat.status === 'FAILED') {
                sent += count;
                failed += count;
                if (stat.failureCategory) {
                    failureCategories[stat.failureCategory] = (failureCategories[stat.failureCategory] || 0) + count;
                }
            }
            // Provider breakdown (failures only usually interesting, or all?)
            // Let's count failures by provider
            if (stat.status === 'FAILED') {
                byProvider[stat.provider] = (byProvider[stat.provider] || 0) + count;
            }
        });

        const timeline = [
            { event: 'created', at: campaign.createdAt, by: campaign.createdBy },
            ...campaign.approvals.map((a: any) => ({ event: 'approved', at: a.approvedAt, by: a.approvedBy })),
            ...(campaign.scheduledAt ? [{ event: 'scheduled', at: campaign.scheduledAt }] : []),
            ...(campaign.startedAt ? [{ event: 'started', at: campaign.startedAt }] : []),
            ...(campaign.completedAt ? [{ event: 'completed', at: campaign.completedAt }] : []),
        ].sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime());

        const report = {
            campaign: {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                createdBy: campaign.createdBy,
                createdAt: campaign.createdAt,
            },
            approvals: (campaign as any).approvals,
            audience: {
                sourceType: (campaign as any).audienceSourceType,
                assetId: (campaign as any).audienceAssetId,
                hash: (campaign as any).audienceHash,
                totalUsers: campaign.totalTargets,
            },
            delivery: {
                sent,
                delivered,
                failed,
            },
            failures: {
                byCategory: failureCategories,
                byProvider: byProvider,
            },
            timeline,
        };

        sendSuccess(res, report);
    } catch (error) {
        next(error);
    }
};

export const getProviderHealth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { appId, env, from, to } = req.query;

        // Date range filter
        const dateFilter: any = {};
        if (from) dateFilter.gte = new Date(String(from));
        if (to) dateFilter.lte = new Date(String(to));

        // This is a heavy query on large datasets, usually should use dedicated stats table.
        // For now, aggregate from NotificationDelivery directly.

        const stats = await prisma.notificationDelivery.groupBy({
            by: ['provider', 'status', 'failureCategory'] as const,
            where: {
                createdAt: dateFilter,
                notification: {
                    appId: appId ? String(appId) : undefined,
                    // TODO: Filter by environment if added to Notification model 
                    // (Currently env is only on App/Credentials, not stored on Notification explicitly, 
                    // though usually implied by credential used. We might need to join or assume PROD/UAT based on app?)
                    // For now ignoring env filter on delivery table directly unless we migrate schema to add it.
                }
            },
            _count: true
        });

        // Transform to friendly format
        const providers: Record<string, any> = {};

        (stats as any[]).forEach(s => {
            if (!providers[s.provider]) {
                providers[s.provider] = {
                    provider: s.provider,
                    sent: 0,
                    delivered: 0,
                    failed: 0,
                    failures: {}
                };
            }
            const p = providers[s.provider];
            const count = s._count as number;

            if (s.status === 'DID_NOT_TRY') return; // Pending

            p.sent += count;
            if (s.status === 'DELIVERED') p.delivered += count;
            if (s.status === 'FAILED') {
                p.failed += count;
                if (s.failureCategory) {
                    p.failures[s.failureCategory] = (p.failures[s.failureCategory] || 0) + count;
                }
            }
        });

        const data = Object.values(providers).map((p: any) => ({
            ...p,
            deliveryRate: p.sent > 0 ? p.delivered / p.sent : 0
        }));

        sendSuccess(res, {
            providers: data,
            period: { from, to }
        });
    } catch (error) {
        next(error);
    }
};
