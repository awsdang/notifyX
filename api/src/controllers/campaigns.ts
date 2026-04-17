/**
 * Campaigns Controller
 * Handles bulk notification campaigns with CSV upload and targeting
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import { sendSuccess, sendPaginated, AppError } from "../utils/response";
import { appIdScopeFilter, canAccessAppId } from "../middleware/tenantScope";
import {
  createCampaignSchema,
  updateCampaignSchema,
} from "../schemas/campaigns";
import { getFileStream } from "../services/storage";
import { createInterface } from "readline";
import { addDeliveriesToQueue } from "../services/queue";
import {
  buildCampaignTargetingData,
  parseCampaignTargetingData,
} from "../utils/campaignTargeting";
import { normalizeOpenLinkCta } from "../utils/cta";

function assertAppAccess(req: Request, appId: string): void {
  if (!canAccessAppId(req, appId)) {
    throw new AppError(403, "Access denied for app", "APP_ACCESS_DENIED");
  }
}

async function getScopedCampaignOrThrow(req: Request, id: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, ...appIdScopeFilter(req) },
  });
  if (!campaign) {
    throw new AppError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
  }
  return campaign;
}

function campaignResponse(campaign: any) {
  const targetingData = parseCampaignTargetingData(campaign.targetUserIds);
  return {
    ...campaign,
    targetUserIds: targetingData.userIds,
    platforms: targetingData.platforms ?? null,
    actionUrl: targetingData.actionUrl ?? null,
    data: targetingData.data ?? null,
    actions: targetingData.actions ?? null,
  };
}

/**
 * Create a new campaign
 */
export const createCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = createCampaignSchema.parse(req.body);
    const adminUser = req.adminUser;
    assertAppAccess(req, data.appId);

    // Verify app exists
    const app = await prisma.app.findUnique({ where: { id: data.appId } });
    if (!app) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }

    const targetUserIds = data.targetUserIds ?? [];

    // Calculate initial target count for ALL mode
    let totalTargets = 0;
    if (data.targetingMode === "ALL") {
      totalTargets = await prisma.user.count({
        where: { appId: data.appId, deletedAt: null },
      });
    } else if (data.targetingMode === "USER_LIST" && data.targetUserIds) {
      totalTargets = targetUserIds.length;
    }

    // Handle asset-based targeting (simple pass-through of ID for now, async processing later)
    let audienceHash: string | null = null;
    if (data.targetingMode === "CSV" && data.audienceAssetId) {
      // In real impl, we'd hash the asset content. For now, use ID as proxy or null.
      audienceHash = data.audienceAssetId;
    }

    const normalizedCta = normalizeOpenLinkCta({
      actionUrl: data.actionUrl,
      actions: data.actions,
      data: data.data,
      maxActions: 2,
    });

    const campaign = await prisma.campaign.create({
      data: {
        appId: data.appId,
        name: data.name,
        description: data.description,
        targetingMode: data.targetingMode,
        targetUserIds: buildCampaignTargetingData({
          userIds: targetUserIds,
          platforms: data.platforms,
          actionUrl: normalizedCta.actionUrl,
          data: normalizedCta.data,
          actions: normalizedCta.actions,
        }),
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

    sendSuccess(res, campaignResponse(campaign), 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all campaigns
 */
export const getCampaigns = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId, status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { ...appIdScopeFilter(req) };
    if (appId) where.appId = String(appId);
    if (status) where.status = String(status);

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.campaign.count({ where }),
    ]);

    sendPaginated(
      res,
      campaigns.map((campaign) => campaignResponse(campaign)),
      total,
      pageNum,
      limitNum,
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single campaign
 */
export const getCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findFirst({
      where: { id: String(id), ...appIdScopeFilter(req) },
    });
    if (!campaign) {
      throw new AppError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
    }

    sendSuccess(res, campaignResponse(campaign));
  } catch (error) {
    next(error);
  }
};

/**
 * Update a campaign (only if DRAFT)
 */
export const updateCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const data = updateCampaignSchema.parse(req.body);

    const existing = await getScopedCampaignOrThrow(req, String(id));

    // Allow updates if DRAFT, or if we are resetting to DRAFT (unscheduling/unapproving)
    const isResettingToDraft = data.status === "DRAFT";

    if (existing.status !== "DRAFT" && !isResettingToDraft) {
      throw new AppError(
        400,
        "Can only update DRAFT campaigns",
        "CAMPAIGN_NOT_DRAFT",
      );
    }

    const existingTargeting = parseCampaignTargetingData(existing.targetUserIds);

    // Recalculate targets if targeting changed
    let totalTargets = existing.totalTargets;
    if (data.targetingMode === "ALL") {
      totalTargets = await prisma.user.count({
        where: { appId: existing.appId, deletedAt: null },
      });
    } else if (data.targetingMode === "USER_LIST" && data.targetUserIds) {
      totalTargets = data.targetUserIds.length;
    }

    const mergedTargetUserIds =
      data.targetUserIds ?? existingTargeting.userIds ?? [];
    const mergedPlatforms = data.platforms ?? existingTargeting.platforms;
    const mergedActionUrl = data.actionUrl ?? existingTargeting.actionUrl;
    const mergedData = data.data ?? existingTargeting.data;
    const mergedActions = data.actions ?? existingTargeting.actions;
    const normalizedCta = normalizeOpenLinkCta({
      actionUrl: mergedActionUrl,
      actions: mergedActions as unknown[] | undefined,
      data: mergedData ?? undefined,
      maxActions: 2,
    });

    const campaign = await prisma.campaign.update({
      where: { id: String(id) },
      data: {
        name: data.name,
        description: data.description,
        targetingMode: data.targetingMode,
        title: data.title,
        subtitle: data.subtitle,
        body: data.body,
        image: data.image,
        priority: data.priority,
        totalTargets,
        targetUserIds: buildCampaignTargetingData({
          userIds: mergedTargetUserIds,
          platforms: mergedPlatforms,
          actionUrl: normalizedCta.actionUrl,
          data: normalizedCta.data,
          actions: normalizedCta.actions,
        }),
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        status: data.status as any,
      },
    });

    sendSuccess(res, campaignResponse(campaign));
  } catch (error) {
    next(error);
  }
};

/**
 * Schedule a campaign
 */
export const scheduleCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;

    const existing = await getScopedCampaignOrThrow(req, String(id));

    if (
      existing.status !== "DRAFT" &&
      (existing.status as any) !== "APPROVED"
    ) {
      throw new AppError(
        400,
        "Can only schedule DRAFT or APPROVED campaigns",
        "CAMPAIGN_NOT_READY",
      );
    }

    // Block schedule if approvals are enforced and not approved
    if (
      existing.status === "DRAFT" &&
      process.env.REQUIRE_CAMPAIGN_APPROVAL === "true"
    ) {
      throw new AppError(
        400,
        "Campaign requires approval before scheduling",
        "APPROVAL_REQUIRED",
      );
    }

    const scheduleTime = scheduledAt ? new Date(scheduledAt) : new Date();

    if (scheduleTime < new Date()) {
      throw new AppError(
        400,
        "Schedule time must be in the future",
        "INVALID_SCHEDULE",
      );
    }

    const campaign = await prisma.campaign.update({
      where: { id: String(id) },
      data: {
        status: "SCHEDULED", // Cast if needed, but should match enum
        scheduledAt: scheduleTime,
      },
    });

    sendSuccess(res, campaignResponse(campaign));
  } catch (error) {
    next(error);
  }
};

/**
 * Send a campaign immediately
 */
export const sendCampaignNow = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    // Block if approvals are required and campaign is still DRAFT
    const requireApproval = process.env.REQUIRE_CAMPAIGN_APPROVAL === "true";

    // Atomic state transition: only allow DRAFT (no approval) or APPROVED → SCHEDULED
    const allowedStatuses = requireApproval
      ? (["APPROVED"] as const)
      : (["DRAFT", "APPROVED"] as const);

    const result = await prisma.campaign.updateMany({
      where: {
        id: String(id),
        ...appIdScopeFilter(req),
        status: { in: [...allowedStatuses] as any },
      },
      data: {
        status: "SCHEDULED",
        scheduledAt: new Date(),
      },
    });

    if (result.count === 0) {
      const existing = await prisma.campaign.findFirst({
        where: { id: String(id), ...appIdScopeFilter(req) },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new AppError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
      }
      if (requireApproval && existing.status === "DRAFT") {
        throw new AppError(
          400,
          "Campaign requires approval before sending",
          "APPROVAL_REQUIRED",
        );
      }
      throw new AppError(
        409,
        `Campaign cannot be sent in its current status (${existing.status})`,
        "STATE_CONFLICT",
      );
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: String(id), ...appIdScopeFilter(req) },
    });

    sendSuccess(res, campaign ? campaignResponse(campaign) : campaign);
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel a campaign
 */
export const cancelCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    // Atomic state transition: only cancel if in a cancellable state
    const result = await prisma.campaign.updateMany({
      where: {
        id: String(id),
        ...appIdScopeFilter(req),
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      data: { status: "CANCELLED" },
    });

    if (result.count === 0) {
      const existing = await prisma.campaign.findFirst({
        where: { id: String(id), ...appIdScopeFilter(req) },
        select: { id: true, status: true },
      });
      if (!existing) {
        throw new AppError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
      }
      throw new AppError(
        400,
        "Campaign is already finished",
        "CAMPAIGN_FINISHED",
      );
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: String(id), ...appIdScopeFilter(req) },
    });

    sendSuccess(res, campaign ? campaignResponse(campaign) : campaign);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a campaign (only if DRAFT or CANCELLED)
 */
export const deleteCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const existing = await getScopedCampaignOrThrow(req, String(id));

    if (existing.status === "PROCESSING" || existing.status === "SCHEDULED") {
      throw new AppError(
        400,
        "Cannot delete active campaigns",
        "CANNOT_DELETE",
      );
    }

    await prisma.campaign.deleteMany({
      where: { id: String(id), ...appIdScopeFilter(req) },
    });

    sendSuccess(res, { message: "Campaign deleted" });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload CSV with user IDs for targeting
 */
export const uploadCampaignCSV = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const existing = await getScopedCampaignOrThrow(req, String(id));

    if (existing.status !== "DRAFT") {
      throw new AppError(
        400,
        "Can only upload CSV for DRAFT campaigns",
        "CAMPAIGN_NOT_DRAFT",
      );
    }

    // Parse CSV from request body (expecting JSON array of user IDs)
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new AppError(
        400,
        "userIds must be a non-empty array",
        "INVALID_CSV",
      );
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

    const validUserIds = existingUsers.map((u) => u.externalUserId);
    const invalidCount = userIds.length - validUserIds.length;
    const existingTargeting = parseCampaignTargetingData(existing.targetUserIds);

    const campaign = await prisma.campaign.update({
      where: { id: String(id) },
      data: {
        targetingMode: "CSV",
        targetUserIds: buildCampaignTargetingData({
          userIds: validUserIds,
          platforms: existingTargeting.platforms,
          actionUrl: existingTargeting.actionUrl,
          data: existingTargeting.data,
          actions: existingTargeting.actions,
        }),
        totalTargets: validUserIds.length,
      },
    });

    sendSuccess(res, {
      campaign: campaignResponse(campaign),
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
export const getCampaignStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findFirst({
      where: { id: String(id), ...appIdScopeFilter(req) },
    });
    if (!campaign) {
      throw new AppError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
    }

    // Get delivery statistics
    const notifications = await prisma.notification.findMany({
      where: { campaignId: String(id) },
      select: { id: true },
    });

    const notificationIds = notifications.map((n) => n.id);

    const deliveryStats = await prisma.notificationDelivery.groupBy({
      by: ["status"],
      where: { notificationId: { in: notificationIds } },
      _count: true,
    });

    const stats = {
      total: campaign.totalTargets,
      processed: campaign.processedCount,
      sent: campaign.sentCount,
      delivered: campaign.deliveredCount,
      failed: campaign.failedCount,
      deliveryBreakdown: deliveryStats.reduce(
        (acc, s) => {
          acc[s.status] = s._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
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
export const getAudienceEstimate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId, targetingMode, userIds } = req.body;

    if (!appId) {
      throw new AppError(400, "appId is required", "MISSING_APP_ID");
    }
    assertAppAccess(req, appId);

    let count = 0;

    if (targetingMode === "ALL" || !targetingMode) {
      count = await prisma.user.count({
        where: { appId, deletedAt: null },
      });
    } else if (targetingMode === "USER_LIST" && userIds) {
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
          ...(targetingMode === "USER_LIST" && userIds
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
export const getDetailedAudienceEstimate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params; // Campaign ID optional
    const { appId, targetingMode, userIds, assetId } = req.body;

    if (!appId) throw new AppError(400, "appId required");
    assertAppAccess(req, appId);

    // 1. Estimate Users
    let userCount = 0;
    let userWhereInput: any = { appId, deletedAt: null };

    if (targetingMode === "USER_LIST" && userIds) {
      userWhereInput.externalUserId = { in: userIds };
    } else if (targetingMode === "CSV" && assetId) {
      // Fetch asset to get URL (or object name if stored directly)
      // Assuming asset.url contains the object name or relative path we can use with minio,
      // or we might need to parse it.
      // For this implementation, let's assume asset.url is the full public URL, result of uploadFile.
      // But getFileStream needs object name.
      // Let's assume we store objectName in the DB or extract it from URL.
      // The uploadFile returns `${protocol}://${config.endPoint}:${config.port}/${config.bucket}/${objectName}`
      // We can split to get objectName.

      const asset = await prisma.asset.findUnique({ where: { id: assetId } });
      if (!asset) throw new AppError(404, "Audience asset not found");

      const urlParts = asset.url.split("/");
      const objectName = urlParts[urlParts.length - 1] as string;

      try {
        const stream = await getFileStream(objectName);
        const rl = createInterface({
          input: stream,
          crlfDelay: Infinity,
        });

        const csvUserIds: string[] = [];
        let headers: string[] | null = null;
        let userIdIndex = -1 as number;

        for await (const line of rl) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;

          const cols = cleanLine
            .split(",")
            .map((c) => c.trim().replace(/^["']|["']$/g, "")); // Simple CSV split

          if (!headers) {
            headers = cols.map((h) => h.toLowerCase());
            // Try to find user id column
            userIdIndex = headers.findIndex(
              (h) =>
                h === "externaluserid" ||
                h === "userid" ||
                h === "id" ||
                h === "user_id" ||
                h === "email",
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
        console.error("Error reading audience CSV:", err);
        throw new AppError(500, "Failed to process audience CSV");
      }
    }

    userCount = await prisma.user.count({ where: userWhereInput });

    // 2. Estimate Reachable Devices (Active)
    const devices = await prisma.device.groupBy({
      by: ["provider", "platform"],
      where: {
        isActive: true,
        tokenInvalidAt: null,
        user: userWhereInput,
      },
      _count: true,
    });

    // 3. Breakdown
    const breakdown: any = {};
    let totalDevices = 0;
    devices.forEach((d) => {
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
        excludedInvalidTokens: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const duplicateCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const adminUser = req.adminUser;
    const { name } = req.body;

    const existing = await getScopedCampaignOrThrow(req, String(id));

    const campaign = await prisma.campaign.create({
      data: {
        appId: existing.appId,
        name: name || `${existing.name} (Copy)`,
        description: existing.description,
        status: "DRAFT",
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

    sendSuccess(res, campaignResponse(campaign), 201);
  } catch (error) {
    next(error);
  }
};

export const saveCampaignDraft = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const data = updateCampaignSchema.parse(req.body);

    const existing = await getScopedCampaignOrThrow(req, String(id));

    if (existing.status !== "DRAFT") {
      throw new AppError(
        400,
        "Can only save DRAFT campaigns",
        "CAMPAIGN_NOT_DRAFT",
      );
    }

    const existingTargeting = parseCampaignTargetingData(existing.targetUserIds);
    let totalTargets = existing.totalTargets;
    if (data.targetingMode === "ALL") {
      totalTargets = await prisma.user.count({
        where: { appId: existing.appId, deletedAt: null },
      });
    } else if (data.targetingMode === "USER_LIST" && data.targetUserIds) {
      totalTargets = data.targetUserIds.length;
    }

    const mergedTargetUserIds =
      data.targetUserIds ?? existingTargeting.userIds ?? [];
    const mergedPlatforms = data.platforms ?? existingTargeting.platforms;
    const mergedActionUrl = data.actionUrl ?? existingTargeting.actionUrl;
    const mergedData = data.data ?? existingTargeting.data;
    const mergedActions = data.actions ?? existingTargeting.actions;
    const normalizedCta = normalizeOpenLinkCta({
      actionUrl: mergedActionUrl,
      actions: mergedActions as unknown[] | undefined,
      data: mergedData ?? undefined,
      maxActions: 2,
    });

    const campaign = await prisma.campaign.update({
      where: { id: String(id) },
      data: {
        name: data.name,
        description: data.description,
        targetingMode: data.targetingMode,
        title: data.title,
        subtitle: data.subtitle,
        body: data.body,
        image: data.image,
        priority: data.priority,
        totalTargets,
        targetUserIds: buildCampaignTargetingData({
          userIds: mergedTargetUserIds,
          platforms: mergedPlatforms,
          actionUrl: normalizedCta.actionUrl,
          data: normalizedCta.data,
          actions: normalizedCta.actions,
        }),
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        status: data.status as any,
      },
    });

    sendSuccess(res, campaignResponse(campaign));
  } catch (error) {
    next(error);
  }
};

export const submitForReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const existing = await prisma.campaign.findFirst({
      where: { id: String(id), ...appIdScopeFilter(req) },
    });
    if (!existing) throw new AppError(404, "Campaign not found");
    if (existing.status !== "DRAFT")
      throw new AppError(400, "Only DRAFT campaigns can be submitted");

    const campaign = await prisma.campaign.update({
      where: { id: String(id) },
      data: { status: "IN_REVIEW" as any },
    });

    // Log audit (omitted for brevity, handled by middleware/hooks ideally)
    sendSuccess(res, campaignResponse(campaign));
  } catch (error) {
    next(error);
  }
};

export const approveCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const adminUser = req.adminUser!;

    const existing = await prisma.campaign.findFirst({
      where: { id: String(id), ...appIdScopeFilter(req) },
    });
    if (!existing) throw new AppError(404, "Campaign not found");
    if (existing.status !== "IN_REVIEW")
      throw new AppError(400, "Campaign must be IN_REVIEW");

    // Block self-approval: creator cannot approve their own campaign
    if (existing.createdBy === adminUser.id) {
      throw new AppError(
        403,
        "Cannot approve your own campaign",
        "SELF_APPROVAL_BLOCKED",
      );
    }

    // Compute a real snapshot hash of the campaign content
    const crypto = await import("crypto");
    const snapshotData = JSON.stringify({
      title: existing.title,
      subtitle: existing.subtitle,
      body: existing.body,
      image: existing.image,
      targetingMode: existing.targetingMode,
      targetUserIds: existing.targetUserIds,
      priority: existing.priority,
    });
    const campaignSnapshotHash = crypto
      .createHash("sha256")
      .update(snapshotData)
      .digest("hex");

    // Create approval record
    await prisma.campaignApproval.create({
      data: {
        campaignId: String(id),
        approvedBy: adminUser.id,
        campaignSnapshotHash,
        note,
      },
    });

    const campaign = await prisma.campaign.update({
      where: { id: String(id) },
      data: { status: "APPROVED" as any },
      include: { approvals: true } as any,
    });

    sendSuccess(res, campaignResponse(campaign));
  } catch (error) {
    next(error);
  }
};

export const replayCampaignFailures = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const filters = req.body.filters || {};

    // Logic to find failed jobs and re-queue them
    // This interacts with Queue service
    const failedDeliveries = await prisma.notificationDelivery.findMany({
      where: {
        notification: {
          campaignId: String(id),
          ...appIdScopeFilter(req),
        },
        status: "FAILED",
        ...(filters.failureCategories
          ? { failureCategory: { in: filters.failureCategories } }
          : {}),
        ...(filters.providers ? { provider: { in: filters.providers } } : {}),
      },
      include: {
        notification: { select: { appId: true, priority: true } },
        device: { select: { id: true, provider: true } },
      },
      take: 1000, // Batch limit
    });

    // Reset them
    await prisma.$transaction(
      failedDeliveries.map((d) =>
        prisma.notificationDelivery.update({
          where: { id: d.id },
          data: {
            status: "PENDING",
            attempts: 0,
            lastError: null,
            errorCode: null,
          },
        }),
      ),
    );

    // Enqueue individual delivery jobs (NOT explosion jobs) to avoid duplicates
    const deliveryJobs = failedDeliveries.map((d) => ({
      notificationId: d.notificationId,
      deviceId: d.device.id,
      appId: d.notification.appId,
      provider: d.device.provider,
      priority: ((d.notification.priority as string) || "NORMAL") as
        | "LOW"
        | "NORMAL"
        | "HIGH",
    }));

    await addDeliveriesToQueue(deliveryJobs, "NORMAL");

    sendSuccess(res, { replayedCount: failedDeliveries.length });
  } catch (error) {
    next(error);
  }
};
