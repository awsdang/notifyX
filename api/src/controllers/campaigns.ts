/**
 * Campaigns Controller
 * Handles bulk notification campaigns with CSV upload and targeting
 */

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { sendSuccess, AppError } from '../utils/response';
import { createCampaignSchema, updateCampaignSchema } from '../schemas/campaigns';
import { getFileStream } from '../services/storage';
import { createInterface } from 'readline';
import { addNotificationToQueue } from '../services/queue';

/**
 * Create a new campaign
 */
export const createCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = createCampaignSchema.parse(req.body);
        const adminUser = (req as any).adminUser;

        // Verify app exists
        const app = await prisma.app.findUnique({ where: { id: data.appId } });
        if (!app) {
            throw new AppError(404, 'App not found', 'APP_NOT_FOUND');
        }

        // Calculate initial target count for ALL mode
        let totalTargets = 0;
        if (data.targetingMode === 'ALL') {
            totalTargets = await prisma.user.count({
                where: { appId: data.appId, deletedAt: null },
            });
        } else if (data.targetingMode === 'USER_LIST' && data.targetUserIds) {
            totalTargets = data.targetUserIds.length;
        }

        // Handle asset-based targeting (simple pass-through of ID for now, async processing later)
        let audienceHash: string | null = null;
        if (data.targetingMode === 'CSV' && data.audienceAssetId) {
            // In real impl, we'd hash the asset content. For now, use ID as proxy or null.
            audienceHash = data.audienceAssetId;
        }

        const campaign = await prisma.campaign.create({
            data: {
                appId: data.appId,
                name: data.name,
                description: data.description,
                targetingMode: data.targetingMode,
                targetUserIds: data.targetUserIds ?? undefined, // Fix Json type issue
                totalTargets,
                title: data.title,
                subtitle: data.subtitle,
                body: data.body,
                image: data.image,
                priority: data.priority,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
                createdBy: adminUser?.id,
                audienceSourceType: data.audienceSourceType,
                audienceAssetId: data.audienceAssetId,
                audienceHash: audienceHash,
            },
        });

        sendSuccess(res, campaign, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * Get all campaigns
 */
export const getCampaigns = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { appId, status } = req.query;

        const where: any = {};
        if (appId) where.appId = String(appId);
        if (status) where.status = String(status);

        const campaigns = await prisma.campaign.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        sendSuccess(res, campaigns);
    } catch (error) {
        next(error);
    }
};

/**
 * Get a single campaign
 */
export const getCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const campaign = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!campaign) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        sendSuccess(res, campaign);
    } catch (error) {
        next(error);
    }
};

/**
 * Update a campaign (only if DRAFT)
 */
export const updateCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data = updateCampaignSchema.parse(req.body);

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        // Allow updates if DRAFT, or if we are resetting to DRAFT (unscheduling/unapproving)
        const isResettingToDraft = data.status === 'DRAFT';

        if (existing.status !== 'DRAFT' && !isResettingToDraft) {
            throw new AppError(400, 'Can only update DRAFT campaigns', 'CAMPAIGN_NOT_DRAFT');
        }

        // Recalculate targets if targeting changed
        let totalTargets = existing.totalTargets;
        if (data.targetingMode === 'ALL') {
            totalTargets = await prisma.user.count({
                where: { appId: existing.appId, deletedAt: null },
            });
        } else if (data.targetingMode === 'USER_LIST' && data.targetUserIds) {
            totalTargets = data.targetUserIds.length;
        }

        const campaign = await prisma.campaign.update({
            where: { id: String(id) },
            data: {
                ...data,
                totalTargets,
                targetUserIds: data.targetUserIds ?? undefined,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
                status: data.status as any,
            },
        });

        sendSuccess(res, campaign);
    } catch (error) {
        next(error);
    }
};

/**
 * Schedule a campaign
 */
export const scheduleCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { scheduledAt } = req.body;

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        if (existing.status !== 'DRAFT' && (existing.status as any) !== 'APPROVED') {
            throw new AppError(400, 'Can only schedule DRAFT or APPROVED campaigns', 'CAMPAIGN_NOT_READY');
        }

        // Block schedule if approvals are enforced and not approved
        if (existing.status === 'DRAFT' && process.env.REQUIRE_CAMPAIGN_APPROVAL === 'true') {
            throw new AppError(400, 'Campaign requires approval before scheduling', 'APPROVAL_REQUIRED');
        }

        const scheduleTime = scheduledAt ? new Date(scheduledAt) : new Date();

        if (scheduleTime < new Date()) {
            throw new AppError(400, 'Schedule time must be in the future', 'INVALID_SCHEDULE');
        }

        const campaign = await prisma.campaign.update({
            where: { id: String(id) },
            data: {
                status: 'SCHEDULED', // Cast if needed, but should match enum
                scheduledAt: scheduleTime,
            },
        });

        sendSuccess(res, campaign);
    } catch (error) {
        next(error);
    }
};

/**
 * Send a campaign immediately
 */
export const sendCampaignNow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        if (existing.status !== 'DRAFT') {
            throw new AppError(400, 'Can only send DRAFT campaigns', 'CAMPAIGN_NOT_DRAFT');
        }

        // Set to SCHEDULED with immediate time - scheduler will pick it up
        const campaign = await prisma.campaign.update({
            where: { id: String(id) },
            data: {
                status: 'SCHEDULED',
                scheduledAt: new Date(),
            },
        });

        sendSuccess(res, campaign);
    } catch (error) {
        next(error);
    }
};

/**
 * Cancel a campaign
 */
export const cancelCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
            throw new AppError(400, 'Campaign is already finished', 'CAMPAIGN_FINISHED');
        }

        const campaign = await prisma.campaign.update({
            where: { id: String(id) },
            data: { status: 'CANCELLED' },
        });

        sendSuccess(res, campaign);
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a campaign (only if DRAFT or CANCELLED)
 */
export const deleteCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        if (existing.status === 'PROCESSING' || existing.status === 'SCHEDULED') {
            throw new AppError(400, 'Cannot delete active campaigns', 'CANNOT_DELETE');
        }

        await prisma.campaign.delete({ where: { id: String(id) } });

        sendSuccess(res, { message: 'Campaign deleted' });
    } catch (error) {
        next(error);
    }
};

/**
 * Upload CSV with user IDs for targeting
 */
export const uploadCampaignCSV = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        if (existing.status !== 'DRAFT') {
            throw new AppError(400, 'Can only upload CSV for DRAFT campaigns', 'CAMPAIGN_NOT_DRAFT');
        }

        // Parse CSV from request body (expecting JSON array of user IDs)
        const { userIds } = req.body;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            throw new AppError(400, 'userIds must be a non-empty array', 'INVALID_CSV');
        }

        // Validate user IDs exist
        const existingUsers = await prisma.user.findMany({
            where: {
                appId: existing.appId,
                externalUserId: { in: userIds },
                deletedAt: null,
            },
            select: { externalUserId: true },
        });

        const validUserIds = existingUsers.map(u => u.externalUserId);
        const invalidCount = userIds.length - validUserIds.length;

        const campaign = await prisma.campaign.update({
            where: { id: String(id) },
            data: {
                targetingMode: 'CSV',
                targetUserIds: validUserIds,
                totalTargets: validUserIds.length,
            },
        });

        sendSuccess(res, {
            campaign,
            validation: {
                total: userIds.length,
                valid: validUserIds.length,
                invalid: invalidCount,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get campaign statistics
 */
export const getCampaignStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const campaign = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!campaign) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        // Get delivery statistics
        const notifications = await prisma.notification.findMany({
            where: { campaignId: String(id) },
            select: { id: true },
        });

        const notificationIds = notifications.map(n => n.id);

        const deliveryStats = await prisma.notificationDelivery.groupBy({
            by: ['status'],
            where: { notificationId: { in: notificationIds } },
            _count: true,
        });

        const stats = {
            total: campaign.totalTargets,
            processed: campaign.processedCount,
            sent: campaign.sentCount,
            delivered: campaign.deliveredCount,
            failed: campaign.failedCount,
            deliveryBreakdown: deliveryStats.reduce((acc, s) => {
                acc[s.status] = s._count;
                return acc;
            }, {} as Record<string, number>),
        };

        sendSuccess(res, {
            campaign: {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                startedAt: campaign.startedAt,
                completedAt: campaign.completedAt,
            },
            stats,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get estimated audience size
 */
export const getAudienceEstimate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { appId, targetingMode, userIds } = req.body;

        if (!appId) {
            throw new AppError(400, 'appId is required', 'MISSING_APP_ID');
        }

        let count = 0;

        if (targetingMode === 'ALL' || !targetingMode) {
            count = await prisma.user.count({
                where: { appId, deletedAt: null },
            });
        } else if (targetingMode === 'USER_LIST' && userIds) {
            count = await prisma.user.count({
                where: {
                    appId,
                    externalUserId: { in: userIds },
                    deletedAt: null,
                },
            });
        }

        const deviceCount = await prisma.device.count({
            where: {
                isActive: true,
                user: {
                    appId,
                    deletedAt: null,
                    ...(targetingMode === 'USER_LIST' && userIds
                        ? { externalUserId: { in: userIds } }
                        : {}),
                },
            },
        });

        sendSuccess(res, {
            users: count,
            devices: deviceCount,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get detailed audience estimation (Phase 3)
 */
export const getDetailedAudienceEstimate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params; // Campaign ID optional
        const { appId, targetingMode, userIds, assetId } = req.body;

        if (!appId) throw new AppError(400, 'appId required');

        // 1. Estimate Users
        let userCount = 0;
        let userWhereInput: any = { appId, deletedAt: null };

        if (targetingMode === 'USER_LIST' && userIds) {
            userWhereInput.externalUserId = { in: userIds };
        } else if (targetingMode === 'CSV' && assetId) {
            // Fetch asset to get URL (or object name if stored directly)
            // Assuming asset.url contains the object name or relative path we can use with minio, 
            // or we might need to parse it. 
            // For this implementation, let's assume asset.url is the full public URL, result of uploadFile.
            // But getFileStream needs object name. 
            // Let's assume we store objectName in the DB or extract it from URL.
            // The uploadFile returns `${protocol}://${config.endPoint}:${config.port}/${config.bucket}/${objectName}`
            // We can split to get objectName.

            const asset = await prisma.asset.findUnique({ where: { id: assetId } });
            if (!asset) throw new AppError(404, 'Audience asset not found');

            const urlParts = asset.url.split('/');
            const objectName = urlParts[urlParts.length - 1] as string;

            try {
                const stream = await getFileStream(objectName);
                const rl = createInterface({
                    input: stream,
                    crlfDelay: Infinity
                });

                const csvUserIds: string[] = [];
                let headers: string[] | null = null;
                let userIdIndex = -1 as number;

                for await (const line of rl) {
                    const cleanLine = line.trim();
                    if (!cleanLine) continue;

                    const cols = cleanLine.split(',').map(c => c.trim().replace(/^["']|["']$/g, '')); // Simple CSV split

                    if (!headers) {
                        headers = cols.map(h => h.toLowerCase());
                        // Try to find user id column
                        userIdIndex = headers.findIndex(h =>
                            h === 'externaluserid' || h === 'userid' || h === 'id' || h === 'user_id' || h === 'email'
                        );
                        if (userIdIndex === -1) userIdIndex = 0; // Fallback to first col
                        continue;
                    }

                    if (userIdIndex !== -1 && cols[userIdIndex]) {
                        csvUserIds.push(cols[userIdIndex] as string);
                    }
                }

                if (csvUserIds.length > 0) {
                    userWhereInput.externalUserId = { in: csvUserIds };
                }
            } catch (err: any) {
                console.error('Error reading audience CSV:', err);
                throw new AppError(500, 'Failed to process audience CSV');
            }
        }

        userCount = await prisma.user.count({ where: userWhereInput });

        // 2. Estimate Reachable Devices (Active)
        const devices = await prisma.device.groupBy({
            by: ['provider', 'platform'],
            where: {
                isActive: true,
                tokenInvalidAt: null,
                user: userWhereInput
            },
            _count: true
        });

        // 3. Breakdown
        const breakdown: any = {};
        let totalDevices = 0;
        devices.forEach(d => {
            const key = d.provider;
            breakdown[key] = (breakdown[key] || 0) + d._count;
            totalDevices += d._count;
        });

        sendSuccess(res, {
            estimatedUsers: userCount,
            estimatedDevices: totalDevices,
            breakdown,
            assumptions: {
                excludedInactive: true,
                excludedInvalidTokens: true
            }
        });
    } catch (error) {
        next(error);
    }
};

export const duplicateCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const adminUser = (req as any).adminUser;
        const { name } = req.body;

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        const campaign = await prisma.campaign.create({
            data: {
                appId: existing.appId,
                name: name || `${existing.name} (Copy)`,
                description: existing.description,
                status: 'DRAFT',
                targetingMode: existing.targetingMode,
                targetUserIds: existing.targetUserIds ?? undefined,
                totalTargets: existing.totalTargets,
                title: existing.title,
                subtitle: existing.subtitle,
                body: existing.body,
                image: existing.image,
                priority: existing.priority,
                createdBy: adminUser?.id,
            },
        });

        sendSuccess(res, campaign, 201);
    } catch (error) {
        next(error);
    }
};

export const saveCampaignDraft = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const data = updateCampaignSchema.parse(req.body);

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) {
            throw new AppError(404, 'Campaign not found', 'CAMPAIGN_NOT_FOUND');
        }

        if (existing.status !== 'DRAFT') {
            throw new AppError(400, 'Can only save DRAFT campaigns', 'CAMPAIGN_NOT_DRAFT');
        }

        let totalTargets = existing.totalTargets;
        if (data.targetingMode === 'ALL') {
            totalTargets = await prisma.user.count({
                where: { appId: existing.appId, deletedAt: null },
            });
        } else if (data.targetingMode === 'USER_LIST' && data.targetUserIds) {
            totalTargets = data.targetUserIds.length;
        }

        const campaign = await prisma.campaign.update({
            where: { id: String(id) },
            data: {
                ...data,
                totalTargets,
                targetUserIds: data.targetUserIds ?? undefined,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
                status: data.status as any,
            },
        });

        sendSuccess(res, campaign);
    } catch (error) {
        next(error);
    }
};

export const submitForReview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) throw new AppError(404, 'Campaign not found');
        if (existing.status !== 'DRAFT') throw new AppError(400, 'Only DRAFT campaigns can be submitted');

        const campaign = await prisma.campaign.update({
            where: { id: String(id) },
            data: { status: 'IN_REVIEW' as any }
        });

        // Log audit (omitted for brevity, handled by middleware/hooks ideally)
        sendSuccess(res, campaign);
    } catch (error) { next(error); }
};

export const approveCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { note } = req.body;
        const adminUser = (req as any).adminUser;

        const existing = await prisma.campaign.findUnique({ where: { id: String(id) } });
        if (!existing) throw new AppError(404, 'Campaign not found');
        if (existing.status !== 'IN_REVIEW') throw new AppError(400, 'Campaign must be IN_REVIEW');

        // TODO: Enforce approver != creator in production, optional for dev/testing if needed
        // if (existing.createdBy === adminUser.id) throw new AppError(403, 'Cannot approve your own campaign');

        // Create approval record
        await prisma.campaignApproval.create({
            data: {
                campaignId: String(id),
                approvedBy: adminUser.id,
                campaignSnapshotHash: 'hash-placeholder', // In real impl, hash full campaign content
                note
            }
        });

        const campaign = await prisma.campaign.update({
            where: { id: String(id) },
            data: { status: 'APPROVED' as any },
            include: { approvals: true } as any
        });

        sendSuccess(res, campaign);
    } catch (error) { next(error); }
};

export const replayCampaignFailures = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const filters = req.body.filters || {};

        // Logic to find failed jobs and re-queue them
        // This interacts with Queue service
        const failedDeliveries = await prisma.notificationDelivery.findMany({
            where: {
                notification: { campaignId: String(id) },
                status: 'FAILED',
                ...(filters.failureCategories ? { failureCategory: { in: filters.failureCategories } } : {}),
                ...(filters.providers ? { provider: { in: filters.providers } } : {})
            },
            take: 1000 // Batch limit
        });

        // Reset them
        await prisma.$transaction(
            failedDeliveries.map(d =>
                prisma.notificationDelivery.update({
                    where: { id: d.id },
                    data: { status: 'PENDING', attempts: 0, lastError: null, errorCode: null }
                })
            )
        );

        // Enqueue to BullMQ
        const promises = failedDeliveries.map(d =>
            addNotificationToQueue(d.notificationId, 'NORMAL')
                .catch(err => console.error(`Failed to re-queue notification ${d.notificationId}:`, err))
        );

        await Promise.all(promises);

        sendSuccess(res, { replayedCount: failedDeliveries.length });
    } catch (error) { next(error); }
};
