import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../services/database";
import {
  createAppSchema,
  updateAppSchema,
  webhookConfigSchema,
  inviteAppAccessSchema,
} from "../schemas/apps";
import { invalidateCache } from "../middleware/cacheMiddleware";
import { sendSuccess, sendPaginated, AppError } from "../utils/response";
import { appScopeFilter } from "../middleware/tenantScope";
import { logAudit, extractRequestInfo } from "../services/audit";
import { normalQueue, highQueue } from "../services/queue";
import { testWebhook } from "../services/webhook";
import { parseEnvironment } from "../utils/environment";

// Helper to safely get a string from query params
const getQueryString = (val: any): string | undefined => {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  return undefined;
};

const DEFAULT_INVITE_EXPIRY_DAYS = 14;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const normalizeAndroidNotificationIcon = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

async function resolveAppIconUpdate(
  appId: string,
  notificationIconAssetId: string | null | undefined,
): Promise<
  | {
      notificationIconAssetId?: string | null;
      notificationIconUrl?: string | null;
    }
  | undefined
> {
  if (notificationIconAssetId === undefined) {
    return undefined;
  }

  if (notificationIconAssetId === null) {
    return {
      notificationIconAssetId: null,
      notificationIconUrl: null,
    };
  }

  const asset = await prisma.asset.findFirst({
    where: {
      id: notificationIconAssetId,
      appId,
      mimeType: { startsWith: "image/" },
    },
    select: {
      id: true,
      url: true,
    },
  });

  if (!asset) {
    throw new AppError(
      400,
      "Notification icon asset must be an uploaded image for this app",
      "INVALID_NOTIFICATION_ICON_ASSET",
    );
  }

  return {
    notificationIconAssetId: asset.id,
    notificationIconUrl: asset.url,
  };
}

const DEFAULT_AUTOMATION_TRIGGERS: Array<{
  name: string;
  eventName: string;
  description: string;
  conditionFields: string[];
  conditionSchema: Array<{
    key: string;
    type: "string" | "number";
    operators: string[];
  }>;
  payloadExample: Record<string, unknown>;
}> = [
  {
    name: "On Registration",
    eventName: "On Registration",
    description: "Fires when a user is registered in NotifyX.",
    conditionFields: ["externalUserId", "userId"],
    conditionSchema: [
      {
        key: "externalUserId",
        type: "string",
        operators: ["equals", "not_equals", "contains", "exists"],
      },
      {
        key: "userId",
        type: "string",
        operators: ["equals", "not_equals", "contains", "exists"],
      },
    ],
    payloadExample: {
      externalUserId: "user_123",
      userId: "internal-user-id",
    },
  },
  {
    name: "On Purchase",
    eventName: "On Purchase",
    description: "Fires when your backend reports a completed purchase event.",
    conditionFields: ["payload.orderId", "payload.total", "payload.currency"],
    conditionSchema: [
      {
        key: "payload.orderId",
        type: "string",
        operators: ["equals", "not_equals", "contains", "exists"],
      },
      {
        key: "payload.total",
        type: "number",
        operators: ["equals", "not_equals", "greater_than", "less_than", "exists"],
      },
      {
        key: "payload.currency",
        type: "string",
        operators: ["equals", "not_equals", "contains", "exists"],
      },
    ],
    payloadExample: {
      orderId: "A1023",
      total: 59.99,
      currency: "USD",
    },
  },
];

export const createApp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = createAppSchema.parse(req.body);
    const adminUser = req.adminUser;

    const app = await prisma.app.create({
      data: {
        name: data.name,
        defaultLanguage: data.defaultLanguage,
        platforms: data.platforms,
      },
    });

    // Bootstrap default environments so credentials/webhooks can be configured immediately.
    await prisma.appEnvironment.createMany({
      data: [
        { appId: app.id, env: "PROD", isEnabled: true },
        { appId: app.id, env: "UAT", isEnabled: true },
      ],
      skipDuplicates: true,
    });

    await prisma.automationTrigger.createMany({
      data: DEFAULT_AUTOMATION_TRIGGERS.map((trigger) => ({
        appId: app.id,
        name: trigger.name,
        eventName: trigger.eventName,
        description: trigger.description,
        conditionFields: trigger.conditionFields as any,
        conditionSchema: trigger.conditionSchema as any,
        payloadExample: trigger.payloadExample as any,
        isActive: true,
        createdBy: adminUser?.id,
      })),
      skipDuplicates: true,
    });

    // Invalidate caches so subsequent GETs return fresh data
    await invalidateCache("/apps");
    await invalidateCache("/onboarding-status");

    await logAudit({
      adminUserId: adminUser?.id,
      action: "APP_CREATED",
      resource: "app",
      resourceId: app.id,
      appId: app.id,
      details: { name: app.name },
      ...extractRequestInfo(req),
    });

    sendSuccess(res, app, 201);
  } catch (error) {
    next(error);
  }
};

export const getApps = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where = { ...appScopeFilter(req) };

    const [apps, total] = await Promise.all([
      prisma.app.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.app.count({ where }),
    ]);

    sendPaginated(res, apps, total, pageNum, limitNum);
  } catch (error) {
    next(error);
  }
};

export const getApp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const app = await prisma.app.findFirst({
      where: { id: String(id), ...appScopeFilter(req) },
    });
    if (!app) {
      throw new AppError(404, "App not found");
    }
    sendSuccess(res, app);
  } catch (error) {
    next(error);
  }
};

export const getAppAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: appId } = req.params as { id: string };

    const app = await prisma.app.findFirst({
      where: { id: appId, ...appScopeFilter(req) },
      select: { id: true },
    });
    if (!app) {
      throw new AppError(404, "App not found");
    }

    const [memberships, invites] = await Promise.all([
      prisma.appManager.findMany({
        where: { appId },
        include: {
          adminUser: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              isActive: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.appAccessInvite.findMany({
        where: { appId, status: "PENDING" },
        include: {
          invitedByAdminUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    sendSuccess(res, {
      members: memberships.map((membership) => ({
        assignmentId: membership.id,
        appId: membership.appId,
        adminUserId: membership.adminUserId,
        ...membership.adminUser,
      })),
      invites,
    });
  } catch (error) {
    next(error);
  }
};

export const inviteAppAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: appId } = req.params as { id: string };
    const adminUser = req.adminUser;
    const data = inviteAppAccessSchema.parse(req.body);
    const now = new Date();
    const inviteRole = data.role || "MARKETING_MANAGER";
    const expiresAt = new Date(
      now.getTime() + (data.expiresInDays || DEFAULT_INVITE_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
    );
    const email = normalizeEmail(data.email);

    const app = await prisma.app.findUnique({
      where: { id: appId },
      select: { id: true, name: true },
    });
    if (!app) {
      throw new AppError(404, "App not found");
    }

    if (adminUser && normalizeEmail(adminUser.email) === email) {
      throw new AppError(400, "You already have access to this workspace");
    }

    const existingAdmin = await prisma.adminUser.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (existingAdmin) {
      if (!existingAdmin.isActive) {
        throw new AppError(400, "Target admin account is disabled");
      }
      if (existingAdmin.role === "SUPER_ADMIN") {
        throw new AppError(400, "SUPER_ADMIN already has access to all apps");
      }

      const assignment = await prisma.appManager.upsert({
        where: {
          adminUserId_appId: {
            adminUserId: existingAdmin.id,
            appId,
          },
        },
        create: {
          adminUserId: existingAdmin.id,
          appId,
        },
        update: {},
        include: {
          adminUser: {
            select: { id: true, email: true, name: true, role: true, isActive: true },
          },
        },
      });

      await prisma.appAccessInvite.updateMany({
        where: { appId, email, status: "PENDING" },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
          acceptedByAdminUserId: existingAdmin.id,
        },
      });

      await logAudit({
        adminUserId: adminUser?.id,
        action: "APP_UPDATED",
        resource: "app",
        resourceId: appId,
        appId,
        details: {
          event: "member_assigned",
          invitedEmail: email,
          assignedAdminUserId: existingAdmin.id,
        },
        ...extractRequestInfo(req),
      });

      sendSuccess(
        res,
        {
          kind: "ASSIGNED",
          member: {
            assignmentId: assignment.id,
            appId: assignment.appId,
            adminUserId: assignment.adminUserId,
            ...assignment.adminUser,
          },
        },
        201,
      );
      return;
    }

    const invite = await prisma.appAccessInvite.upsert({
      where: {
        appId_email: {
          appId,
          email,
        },
      },
      create: {
        appId,
        email,
        role: inviteRole,
        invitedByAdminUserId: adminUser?.id,
        expiresAt,
        status: "PENDING",
      },
      update: {
        role: inviteRole,
        invitedByAdminUserId: adminUser?.id,
        expiresAt,
        status: "PENDING",
        acceptedAt: null,
        acceptedByAdminUserId: null,
      },
      include: {
        invitedByAdminUser: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    await logAudit({
      adminUserId: adminUser?.id,
      action: "APP_UPDATED",
      resource: "app",
      resourceId: appId,
      appId,
      details: {
        event: "member_invited",
        inviteId: invite.id,
        invitedEmail: invite.email,
        inviteRole: invite.role,
        expiresAt: invite.expiresAt,
      },
      ...extractRequestInfo(req),
    });

    sendSuccess(
      res,
      {
        kind: "INVITED",
        invite,
      },
      201,
    );
  } catch (error) {
    next(error);
  }
};

export const revokeAppInvite = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: appId, inviteId } = req.params as { id: string; inviteId: string };
    const adminUser = req.adminUser;

    const result = await prisma.appAccessInvite.updateMany({
      where: {
        id: inviteId,
        appId,
        status: "PENDING",
      },
      data: {
        status: "REVOKED",
      },
    });

    if (result.count === 0) {
      throw new AppError(404, "Invite not found");
    }

    await logAudit({
      adminUserId: adminUser?.id,
      action: "APP_UPDATED",
      resource: "app",
      resourceId: appId,
      appId,
      details: {
        event: "invite_revoked",
        inviteId,
      },
      ...extractRequestInfo(req),
    });

    sendSuccess(res, { message: "Invite revoked" });
  } catch (error) {
    next(error);
  }
};

export const updateApp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const adminUser = req.adminUser;

    const data = updateAppSchema.parse(req.body);

    const existing = await prisma.app.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "App not found");
    }

    const iconUpdate = await resolveAppIconUpdate(
      id,
      data.notificationIconAssetId,
    );
    const androidNotificationIcon = normalizeAndroidNotificationIcon(
      data.androidNotificationIcon,
    );

    const updateData = {
      ...data,
      ...(iconUpdate || {}),
      ...(androidNotificationIcon !== undefined
        ? { androidNotificationIcon }
        : {}),
    };

    const app = await prisma.app.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      adminUserId: adminUser?.id,
      action: "APP_UPDATED",
      resource: "app",
      resourceId: app.id,
      appId: app.id,
      details: { changes: updateData },
      ...extractRequestInfo(req),
    });

    await invalidateCache("/apps");

    sendSuccess(res, app);
  } catch (error) {
    next(error);
  }
};

export const killApp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const adminUser = req.adminUser;

    const existing = await prisma.app.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "App not found");
    }

    if (existing.isKilled) {
      throw new AppError(400, "App is already killed", "APP_ALREADY_KILLED");
    }

    const cancelledNotifications = await prisma.notification.updateMany({
      where: {
        appId: id,
        status: { in: ["SCHEDULED", "QUEUED", "DRAFT"] },
      },
      data: { status: "CANCELLED" },
    });

    const cancelledCampaigns = await prisma.campaign.updateMany({
      where: {
        appId: id,
        status: { in: ["SCHEDULED", "DRAFT", "PROCESSING"] },
      },
      data: { status: "CANCELLED" },
    });

    const cancelledTests = await prisma.aBTest.updateMany({
      where: {
        appId: id,
        status: { in: ["DRAFT", "ACTIVE"] },
      },
      data: { status: "CANCELLED" },
    });

    const scheduledNotifications = await prisma.notification.findMany({
      where: {
        appId: id,
        status: "CANCELLED",
      },
      select: { id: true },
    });

    // Remove matching jobs by notification ID pattern — avoid iterating all jobs
    // Store notification IDs for targeted removal via BullMQ obliterate or name-based removal
    const notifIds = new Set(scheduledNotifications.map((n) => n.id));
    if (notifIds.size > 0) {
      // Remove jobs in batches from both queues using getJobs with pagination
      for (const queue of [normalQueue, highQueue]) {
        try {
          // Use getJobs with pagination to avoid loading all jobs at once
          let start = 0;
          const batchSize = 100;
          let hasMore = true;
          while (hasMore) {
            const jobs = await queue.getJobs(
              ["waiting", "delayed"],
              start,
              start + batchSize - 1,
            );
            if (jobs.length === 0) break;
            hasMore = jobs.length === batchSize;
            start += batchSize;

            const removePromises = jobs
              .filter(
                (job) =>
                  job.data?.notificationId &&
                  notifIds.has(job.data.notificationId),
              )
              .map((job) => job.remove().catch(() => {}));
            await Promise.all(removePromises);
          }
        } catch (e) {
          console.error(`[KillSwitch] Failed to remove jobs from queue:`, e);
        }
      }
    }

    const app = await prisma.app.update({
      where: { id },
      data: { isKilled: true },
    });

    await logAudit({
      adminUserId: adminUser?.id,
      action: "APP_KILLED",
      resource: "app",
      resourceId: app.id,
      appId: app.id,
      details: {
        cancelledNotifications: cancelledNotifications.count,
        cancelledCampaigns: cancelledCampaigns.count,
        cancelledTests: cancelledTests.count,
      },
      ...extractRequestInfo(req),
    });

    await invalidateCache("/apps");

    sendSuccess(res, {
      app,
      cancelled: {
        notifications: cancelledNotifications.count,
        campaigns: cancelledCampaigns.count,
        abTests: cancelledTests.count,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const reviveApp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const adminUser = req.adminUser;

    const existing = await prisma.app.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "App not found");
    }

    if (!existing.isKilled) {
      throw new AppError(400, "App is not killed", "APP_NOT_KILLED");
    }

    const app = await prisma.app.update({
      where: { id },
      data: { isKilled: false },
    });

    await logAudit({
      adminUserId: adminUser?.id,
      action: "APP_REVIVED",
      resource: "app",
      resourceId: app.id,
      appId: app.id,
      ...extractRequestInfo(req),
    });

    await invalidateCache("/apps");

    sendSuccess(res, app);
  } catch (error) {
    next(error);
  }
};

export const updateWebhookConfig = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const adminUser = req.adminUser;

    const data = webhookConfigSchema.parse(req.body);

    const existing = await prisma.app.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "App not found");
    }

    const app = await prisma.app.update({
      where: { id },
      data: {
        webhookUrl: data.webhookUrl,
        webhookSecret: data.webhookSecret,
        webhookEnabled: data.webhookEnabled,
      },
    });

    await logAudit({
      adminUserId: adminUser?.id,
      action: "APP_UPDATED",
      resource: "app",
      resourceId: app.id,
      appId: app.id,
      details: { webhookConfigured: !!app.webhookUrl },
      ...extractRequestInfo(req),
    });

    sendSuccess(res, {
      id: app.id,
      webhookUrl: app.webhookUrl,
      webhookEnabled: app.webhookEnabled,
      hasSecret: !!app.webhookSecret,
    });
  } catch (error) {
    next(error);
  }
};

export const testWebhookEndpoint = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const existing = await prisma.app.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "App not found");
    }

    if (!existing.webhookUrl) {
      throw new AppError(400, "No webhook URL configured", "NO_WEBHOOK_URL");
    }

    const result = await testWebhook(
      existing.webhookUrl,
      existing.webhookSecret || "",
    );

    if (result.success) {
      sendSuccess(res, {
        statusCode: result.status,
        body: result.body,
      });
    } else {
      throw new AppError(
        502,
        result.body || "Webhook test failed",
        "WEBHOOK_TEST_FAILED",
      );
    }
  } catch (error) {
    next(error);
  }
};

export const createAppEnvironment = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const { env, isEnabled } = req.body;
    const parsedEnv = parseEnvironment(env);

    if (!parsedEnv) {
      throw new AppError(
        400,
        "Invalid environment. Allowed values: PROD, UAT (aliases: production, staging)",
        "INVALID_ENVIRONMENT",
      );
    }

    const app = await prisma.app.findUnique({ where: { id } });
    if (!app) {
      throw new AppError(404, "App not found");
    }

    const appEnvironment = await prisma.appEnvironment.upsert({
      where: { appId_env: { appId: id, env: parsedEnv } },
      update: { isEnabled: isEnabled !== undefined ? isEnabled : true },
      create: {
        appId: id,
        env: parsedEnv,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
      },
    });

    sendSuccess(res, appEnvironment, 201);
  } catch (error) {
    next(error);
  }
};
