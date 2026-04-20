import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import type { NotificationPayload } from "../interfaces/workers/notification";
import {
  createNotificationSchema,
  sendEventSchema,
  testNotificationSchema,
} from "../schemas/notifications";
import { addNotificationToQueue } from "../services/queue";
import { sendSuccess, sendPaginated, AppError } from "../utils/response";
import { logAudit, extractRequestInfo } from "../services/audit";
import { triggerAutomation } from "../services/automation-engine";
import {
  sendPush,
  type ProviderType,
  type PushMessage,
} from "../services/push-providers";
import { decryptTokenIfNeeded } from "../utils/crypto";
import { appIdScopeFilter } from "../middleware/tenantScope";
import { buildCampaignTargetingData } from "../utils/campaignTargeting";
import { normalizeOpenLinkCta } from "../utils/cta";
import { resolvePushMessageIcons, withAppIconData } from "../utils/appIcons";

const BROADCAST_TO_CAMPAIGN_THRESHOLD = parseInt(
  process.env.BROADCAST_TO_CAMPAIGN_THRESHOLD || "5000",
  10,
);

function assertMachineKeyAppAccess(req: Request, appId: string): void {
  if (req.machineAuth && req.machineAuth.appId !== appId) {
    throw new AppError(403, "API key is not scoped to this app", "FORBIDDEN");
  }
}

function parseDateQuery(value: string, endOfDay = false): Date {
  const raw =
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`
      : value;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(
      400,
      `Invalid date value "${value}". Use ISO format.`,
      "INVALID_DATE",
    );
  }
  return parsed;
}

function replaceNotificationVariables(
  value: string | undefined,
  variables: Record<string, string> | undefined,
): string | undefined {
  if (!value) {
    return value;
  }

  let resolved = value;
  if (!variables) {
    return resolved;
  }

  for (const [key, variableValue] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`{{${key}}}`, variableValue);
  }

  return resolved;
}

function getNotificationHistoryOrderBy(
  sortBy: string,
  sortOrder: "asc" | "desc",
) {
  switch (sortBy) {
    case "sendAt":
      return [
        { notification: { sendAt: sortOrder } },
        { createdAt: "desc" as const },
      ];
    case "type":
      return [
        { notification: { type: sortOrder } },
        { createdAt: "desc" as const },
      ];
    case "provider":
      return [{ provider: sortOrder }, { createdAt: "desc" as const }];
    case "status":
    case "deliveryStatus":
      return [{ status: sortOrder }, { createdAt: "desc" as const }];
    case "notificationStatus":
      return [
        { notification: { status: sortOrder } },
        { createdAt: "desc" as const },
      ];
    case "createdAt":
      return [{ createdAt: sortOrder }];
    case "sentAt":
    default:
      return [
        { sentAt: sortOrder },
        { createdAt: sortOrder },
        { id: "desc" as const },
      ];
  }
}

export const getNotificationHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const pageRaw = typeof req.query.page === "string" ? req.query.page : "1";
    const limitRaw =
      typeof req.query.limit === "string" ? req.query.limit : "20";
    const appId = typeof req.query.appId === "string" ? req.query.appId.trim() : "";
    const userIdRaw =
      typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    const deviceIdRaw =
      typeof req.query.deviceId === "string" ? req.query.deviceId.trim() : "";
    const typeRaw =
      typeof req.query.type === "string" ? req.query.type.trim() : "";
    const providerRaw =
      typeof req.query.provider === "string" ? req.query.provider.trim() : "";
    const deliveryStatusRaw =
      typeof req.query.deliveryStatus === "string"
        ? req.query.deliveryStatus.trim()
        : typeof req.query.status === "string"
          ? req.query.status.trim()
          : "";
    const notificationStatusRaw =
      typeof req.query.notificationStatus === "string"
        ? req.query.notificationStatus.trim()
        : "";
    const sortByRaw =
      typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "sentAt";
    const sortOrderRaw =
      typeof req.query.sortOrder === "string"
        ? req.query.sortOrder.trim().toLowerCase()
        : "desc";
    const fromRaw =
      typeof req.query.from === "string" ? req.query.from.trim() : "";
    const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";

    if (!appId) {
      throw new AppError(400, '"appId" is required', "APP_ID_REQUIRED");
    }

    if (!userIdRaw && !deviceIdRaw) {
      throw new AppError(
        400,
        'Either "userId" or "deviceId" is required',
        "RECIPIENT_REQUIRED",
      );
    }

    const allowedSortFields = new Set([
      "createdAt",
      "deliveryStatus",
      "notificationStatus",
      "provider",
      "sendAt",
      "sentAt",
      "status",
      "type",
    ]);
    if (!allowedSortFields.has(sortByRaw)) {
      throw new AppError(
        400,
        `Invalid sortBy. Allowed values: ${Array.from(allowedSortFields).join(", ")}`,
        "INVALID_SORT_BY",
      );
    }

    if (sortOrderRaw !== "asc" && sortOrderRaw !== "desc") {
      throw new AppError(
        400,
        'Invalid sortOrder. Allowed values: "asc" or "desc"',
        "INVALID_SORT_ORDER",
      );
    }

    const page = Math.max(1, parseInt(pageRaw, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 20));
    const skip = (page - 1) * limit;
    const from = fromRaw ? parseDateQuery(fromRaw) : null;
    const to = toRaw ? parseDateQuery(toRaw, true) : null;

    if (from && to && from > to) {
      throw new AppError(
        400,
        '"from" must be before or equal to "to"',
        "INVALID_DATE_RANGE",
      );
    }

    const scopedAppFilter = appIdScopeFilter(req);
    const scopedAppConstraint = scopedAppFilter.appId;
    const appIdFilter = scopedAppConstraint
      ? { appId: { ...scopedAppConstraint, equals: appId } }
      : { appId };

    const where = {
      ...(deliveryStatusRaw ? { status: deliveryStatusRaw.toUpperCase() } : {}),
      ...(providerRaw ? { provider: providerRaw } : {}),
      ...(deviceIdRaw ? { deviceId: deviceIdRaw } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      notification: {
        ...appIdFilter,
        ...(typeRaw ? { type: typeRaw } : {}),
        ...(notificationStatusRaw
          ? { status: notificationStatusRaw.toUpperCase() }
          : {}),
      },
      ...(userIdRaw
        ? {
            device: {
              user: {
                deletedAt: null,
                OR: [{ id: userIdRaw }, { externalUserId: userIdRaw }],
              },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notificationDelivery.findMany({
        where,
        orderBy: getNotificationHistoryOrderBy(
          sortByRaw,
          sortOrderRaw as "asc" | "desc",
        ),
        skip,
        take: limit,
        include: {
          device: {
            select: {
              id: true,
              platform: true,
              user: {
                select: {
                  id: true,
                  externalUserId: true,
                },
              },
            },
          },
          notification: {
            select: {
              id: true,
              appId: true,
              type: true,
              status: true,
              sendAt: true,
              createdAt: true,
              payload: true,
              template: {
                select: {
                  title: true,
                  body: true,
                  image: true,
                },
              },
            },
          },
        },
      }),
      prisma.notificationDelivery.count({ where }),
    ]);

    const historyItems = items.map((item) => {
      const payload = (item.notification.payload || {}) as NotificationPayload;
      const variables = payload.variables;
      const actions = Array.isArray(payload.adhocContent?.actions)
        ? payload.adhocContent.actions
            .filter(
              (action) =>
                action &&
                typeof action.title === "string" &&
                action.title.trim().length > 0,
            )
            .map((action) => ({
              action: action.action,
              title: action.title,
              ...(action.url ? { url: action.url } : {}),
            }))
        : [];
      const actionUrl =
        payload.adhocContent?.actionUrl || actions.find((action) => action.url)?.url;

      return {
        deliveryId: item.id,
        id: item.notification.id,
        appId: item.notification.appId,
        userId: item.device.user.id,
        externalUserId: item.device.user.externalUserId,
        deviceId: item.device.id,
        platform: item.device.platform,
        provider: item.provider,
        type: item.notification.type,
        notificationStatus: item.notification.status,
        deliveryStatus: item.status,
        title: replaceNotificationVariables(
          payload.adhocContent?.title || item.notification.template?.title || undefined,
          variables,
        ) || "Notification",
        body:
          replaceNotificationVariables(
            payload.adhocContent?.body || item.notification.template?.body || undefined,
            variables,
          ) || "",
        image:
          replaceNotificationVariables(
            payload.adhocContent?.image || item.notification.template?.image || undefined,
            variables,
          ) || null,
        cta:
          actionUrl || actions.length > 0
            ? {
                ...(actionUrl ? { actionUrl } : {}),
                ...(actions.length > 0 ? { actions } : {}),
              }
            : null,
        sentAt: item.sentAt,
        sendAt: item.notification.sendAt,
        createdAt: item.createdAt,
        notificationCreatedAt: item.notification.createdAt,
      };
    });

    sendPaginated(res, historyItems, total, page, limit);
  } catch (error) {
    next(error);
  }
};

export const getNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const pageRaw = typeof req.query.page === "string" ? req.query.page : "1";
    const limitRaw =
      typeof req.query.limit === "string" ? req.query.limit : "20";
    const appId = typeof req.query.appId === "string" ? req.query.appId : null;
    const fromRaw =
      typeof req.query.from === "string" ? req.query.from.trim() : "";
    const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const userIdRaw =
      typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    const deviceIdRaw =
      typeof req.query.deviceId === "string" ? req.query.deviceId.trim() : "";

    const page = Math.max(1, parseInt(pageRaw, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 20));
    const skip = (page - 1) * limit;
    const from = fromRaw ? parseDateQuery(fromRaw) : null;
    const to = toRaw ? parseDateQuery(toRaw, true) : null;

    if (from && to && from > to) {
      throw new AppError(
        400,
        '"from" must be before or equal to "to"',
        "INVALID_DATE_RANGE",
      );
    }

    const scopedAppFilter = appIdScopeFilter(req);
    const scopedAppConstraint = scopedAppFilter.appId;
    const appIdFilter =
      appId && scopedAppConstraint
        ? { appId: { ...scopedAppConstraint, equals: appId } }
        : appId
          ? { appId }
          : scopedAppConstraint
            ? { appId: scopedAppConstraint }
            : {};

    const where = {
      ...appIdFilter,
      ...(from || to
        ? {
            sendAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(userIdRaw || deviceIdRaw
        ? {
            deliveries: {
              some: {
                ...(deviceIdRaw ? { deviceId: deviceIdRaw } : {}),
                ...(userIdRaw
                  ? {
                      device: {
                        user: {
                          externalUserId: userIdRaw,
                        },
                      },
                    }
                  : {}),
              },
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          app: { select: { id: true, name: true } },
          _count: { select: { deliveries: true } },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    const notificationIds = items.map((item) => item.id);
    const deliverySummaryMap = new Map<
      string,
      {
        totalDeliveries: number;
        delivered: number;
        failed: number;
        retry: number;
        pending: number;
        lastSentAt: Date | null;
        providers: string[];
      }
    >();

    if (notificationIds.length > 0) {
      const [statusRows, providerRows, sentAtRows] = await Promise.all([
        prisma.notificationDelivery.groupBy({
          by: ["notificationId", "status"],
          where: { notificationId: { in: notificationIds } },
          _count: { _all: true },
        }),
        prisma.notificationDelivery.groupBy({
          by: ["notificationId", "provider"],
          where: { notificationId: { in: notificationIds } },
          _count: { _all: true },
        }),
        prisma.notificationDelivery.groupBy({
          by: ["notificationId"],
          where: { notificationId: { in: notificationIds } },
          _max: { sentAt: true },
        }),
      ]);

      for (const notificationId of notificationIds) {
        deliverySummaryMap.set(notificationId, {
          totalDeliveries: 0,
          delivered: 0,
          failed: 0,
          retry: 0,
          pending: 0,
          lastSentAt: null,
          providers: [],
        });
      }

      for (const row of statusRows) {
        const summary = deliverySummaryMap.get(row.notificationId);
        if (!summary) continue;

        const count = row._count._all;
        summary.totalDeliveries += count;

        if (row.status === "DELIVERED") summary.delivered += count;
        else if (row.status === "FAILED") summary.failed += count;
        else if (row.status === "RETRY") summary.retry += count;
        else summary.pending += count;
      }

      const providerMap = new Map<string, Set<string>>();
      for (const row of providerRows) {
        const existing = providerMap.get(row.notificationId) || new Set<string>();
        existing.add(row.provider);
        providerMap.set(row.notificationId, existing);
      }

      for (const row of sentAtRows) {
        const summary = deliverySummaryMap.get(row.notificationId);
        if (!summary) continue;
        summary.lastSentAt = row._max.sentAt || null;
      }

      for (const [notificationId, providersSet] of providerMap.entries()) {
        const summary = deliverySummaryMap.get(notificationId);
        if (!summary) continue;
        summary.providers = Array.from(providersSet);
      }
    }

    const enrichedItems = items.map((item) => ({
      ...item,
      deliverySummary: deliverySummaryMap.get(item.id) || {
        totalDeliveries: 0,
        delivered: 0,
        failed: 0,
        retry: 0,
        pending: 0,
        lastSentAt: null,
        providers: [],
      },
    }));

    sendPaginated(res, enrichedItems, total, page, limit);
  } catch (error) {
    next(error);
  }
};

export const createNotification = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = createNotificationSchema.parse(req.body);
    const adminUser = req.adminUser;

    const existingApp = await prisma.app.findUnique({
      where: { id: data.appId },
      select: { id: true, isKilled: true },
    });
    if (!existingApp) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }
    assertMachineKeyAppAccess(req, data.appId);

    if (existingApp.isKilled) {
      throw new AppError(
        403,
        "App is disabled. Cannot create notifications.",
        "APP_KILLED",
      );
    }

    // ── Idempotency check ──────────────────────────────────────────
    // Spec: "If a request repeats with same idempotencyKey, do not create duplicates."
    if (data.idempotencyKey) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: {
          appId_key: { appId: data.appId, key: data.idempotencyKey },
        },
      });

      if (existing && existing.expiresAt > new Date()) {
        // Return the already-created notification — 409 with original data
        const existingNotification = await prisma.notification.findUnique({
          where: { id: existing.notificationId },
        });
        if (existingNotification) {
          return sendSuccess(
            res,
            existingNotification,
            200,
            "Idempotent: notification already exists",
          );
        }

        const existingCampaign = await prisma.campaign.findFirst({
          where: { id: existing.notificationId, appId: data.appId },
        });
        if (existingCampaign) {
          return sendSuccess(
            res,
            {
              convertedToCampaign: true,
              threshold: BROADCAST_TO_CAMPAIGN_THRESHOLD,
              campaign: {
                id: existingCampaign.id,
                name: existingCampaign.name,
                status: existingCampaign.status,
                scheduledAt: existingCampaign.scheduledAt,
              },
            },
            200,
            "Idempotent: broadcast already converted to campaign",
          );
        }
      }
    }

    const now = new Date();
    const sendAt = data.sendAt ? new Date(data.sendAt) : now;
    const isImmediate = sendAt <= now;
    const status = isImmediate ? "QUEUED" : "SCHEDULED";

    const [app, template] = await Promise.all([
      prisma.app.findUnique({
        where: { id: data.appId },
        select: {
          id: true,
          defaultTapActionType: true,
          defaultTapActionValue: true,
        },
      }),
      data.templateId
        ? prisma.notificationTemplate.findFirst({
            where: { id: data.templateId, appId: data.appId },
            select: {
              id: true,
              title: true,
              subtitle: true,
              body: true,
              image: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!app) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }

    if (data.templateId && !template) {
      throw new AppError(404, "Template not found", "TEMPLATE_NOT_FOUND");
    }

    const resolvedTitle = data.title?.trim() || template?.title || "";
    const resolvedSubtitle = data.subtitle ?? template?.subtitle ?? undefined;
    const resolvedBody = data.body?.trim() || template?.body || "";
    const resolvedImage = data.image || template?.image || undefined;
    const normalizedCta = normalizeOpenLinkCta({
      actionUrl: data.actionUrl,
      actions: data.actions,
      data: data.data,
      tapActionType: data.tapActionType,
      defaultTapActionType: app.defaultTapActionType,
      defaultTapActionValue: app.defaultTapActionValue,
      maxActions: 2,
    });

    const payload = {
      userIds: data.userIds,
      platforms: data.platforms,
      variables: data.variables,
      adhocContent: {
        title: data.title,
        subtitle: data.subtitle,
        body: data.body,
        image: data.image,
        icon: data.icon,
        actionUrl: normalizedCta.actionUrl,
        actions: normalizedCta.actions,
        data: normalizedCta.data,
      },
    } as any;

    const isBroadcastAllUsers = !data.userIds || data.userIds.length === 0;
    const canConvertToCampaign =
      isBroadcastAllUsers && Boolean(resolvedTitle) && Boolean(resolvedBody);

    if (canConvertToCampaign) {
      const usersCount = await prisma.user.count({
        where: { appId: data.appId, deletedAt: null },
      });

      if (usersCount > BROADCAST_TO_CAMPAIGN_THRESHOLD) {
        const campaign = await prisma.campaign.create({
          data: {
            appId: data.appId,
            name: `Auto Campaign: ${data.title?.trim().slice(0, 48) || "Broadcast"}`,
            description:
              "Auto-created from /notifications because broadcast audience exceeded threshold.",
            status: "SCHEDULED",
            targetingMode: "ALL",
            targetUserIds: buildCampaignTargetingData({
              userIds: [],
              platforms: data.platforms,
              actionUrl: normalizedCta.actionUrl,
              data: normalizedCta.data,
              actions: normalizedCta.actions as any[] | undefined,
            }),
            totalTargets: usersCount,
            title: resolvedTitle,
            subtitle: resolvedSubtitle,
            body: resolvedBody,
            image: resolvedImage,
            priority: data.priority,
            scheduledAt: sendAt,
            createdBy: adminUser?.id,
          },
        });

        if (data.idempotencyKey) {
          await prisma.idempotencyKey
            .create({
              data: {
                appId: data.appId,
                key: data.idempotencyKey,
                notificationId: campaign.id,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
            })
            .catch(() => {});
        }

        await logAudit({
          adminUserId: adminUser?.id,
          action: "CAMPAIGN_CREATED",
          resource: "campaign",
          resourceId: campaign.id,
          appId: data.appId,
          details: {
            originalType: data.type,
            usersCount,
            threshold: BROADCAST_TO_CAMPAIGN_THRESHOLD,
          },
          ...extractRequestInfo(req),
        });

        return sendSuccess(
          res,
          {
            convertedToCampaign: true,
            threshold: BROADCAST_TO_CAMPAIGN_THRESHOLD,
            usersCount,
            campaign: {
              id: campaign.id,
              name: campaign.name,
              status: campaign.status,
              scheduledAt: campaign.scheduledAt,
            },
          },
          201,
          "Broadcast converted to campaign",
        );
      }
    }

    const notification = await prisma.notification.create({
      data: {
        appId: data.appId,
        type: data.type,
        status: status,
        templateId: data.templateId,
        payload: payload,
        sendAt: sendAt,
        priority: data.priority,
        createdBy: adminUser?.id,
      },
    });

    // ── Store idempotency key (24h TTL) ────────────────────────────
    if (data.idempotencyKey) {
      await prisma.idempotencyKey
        .create({
          data: {
            appId: data.appId,
            key: data.idempotencyKey,
            notificationId: notification.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        })
        .catch(() => {
          // Unique constraint violation = race condition duplicate.
          // The notification was already created; this is fine.
        });
    }

    if (isImmediate) {
      const delay = res.locals.rateLimitDelay || 0;
      // If rate limited, we still queue it but with a delay
      await addNotificationToQueue(notification.id, data.priority, delay);
    }

    await logAudit({
      adminUserId: adminUser?.id,
      action: "NOTIFICATION_CREATED",
      resource: "notification",
      resourceId: notification.id,
      appId: data.appId,
      details: {
        type: data.type,
        status,
        userCount: data.userIds?.length || 0,
        platformCount: data.platforms?.length || 0,
      },
      ...extractRequestInfo(req),
    });

    sendSuccess(res, notification, 201);
  } catch (error) {
    next(error);
  }
};

export const sendEvent = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { eventName } = req.params as { eventName: string };
    // req.body is already validated by validateRequest middleware
    const { appId, externalUserId, payload: eventPayload, priority } = req.body;

    if (!appId || typeof appId !== "string") {
      throw new AppError(400, "App ID required");
    }

    const app = await prisma.app.findUnique({ where: { id: appId } });
    if (!app) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }
    assertMachineKeyAppAccess(req, appId);

    if (app.isKilled) {
      throw new AppError(
        403,
        "App is disabled. Cannot send notifications.",
        "APP_KILLED",
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        appId_externalUserId: { appId, externalUserId },
      },
    });

    const lang = user?.language || "en";

    const template = await prisma.notificationTemplate.findFirst({
      where: {
        appId,
        eventName: String(eventName),
        language: lang,
      },
    });

    const notification = await prisma.notification.create({
      data: {
        appId,
        type: "transactional",
        status: "QUEUED",
        templateId: template?.id,
        payload: {
          userIds: [externalUserId],
          variables: eventPayload,
        } as any,
        priority: priority || "HIGH",
        sendAt: new Date(),
      },
    });

    await addNotificationToQueue(notification.id, priority || "HIGH");
    await triggerAutomation(appId, String(eventName), {
      userId: user?.id,
      externalUserId,
      payload: eventPayload,
      eventName: String(eventName),
    });

    sendSuccess(res, { status: "ok", notificationId: notification.id });
  } catch (error) {
    next(error);
  }
};

export const cancelNotification = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const adminUser = req.adminUser;

    const existing = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, appId: true },
    });
    if (!existing) {
      throw new AppError(404, "Notification not found", "NOT_FOUND");
    }
    assertMachineKeyAppAccess(req, existing.appId);

    // Atomic cancel: only transitions SCHEDULED|QUEUED → CANCELLED.
    // Avoids the read-then-write race where a scheduler could transition
    // the notification between our findUnique and update.
    const result = await prisma.notification.updateMany({
      where: {
        id,
        appId: existing.appId,
        status: { in: ["SCHEDULED", "QUEUED"] },
      },
      data: { status: "CANCELLED" },
    });

    if (result.count === 0) {
      throw new AppError(
        409,
        "Notification can no longer be cancelled (status has changed)",
        "STATE_CONFLICT",
      );
    }

    const notification = await prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new AppError(404, "Notification not found", "NOT_FOUND");
    }
    assertMachineKeyAppAccess(req, notification.appId);

    await logAudit({
      adminUserId: adminUser?.id,
      action: "NOTIFICATION_CANCELLED",
      resource: "notification",
      resourceId: notification.id,
      appId: notification.appId,
      ...extractRequestInfo(req),
    });

    sendSuccess(res, notification);
  } catch (error) {
    next(error);
  }
};

export const scheduleNotification = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const { sendAt } = req.body;
    const adminUser = req.adminUser;

    if (!sendAt) {
      throw new AppError(400, "sendAt is required", "MISSING_SEND_AT");
    }

    const scheduleTime = new Date(sendAt);
    if (scheduleTime <= new Date()) {
      throw new AppError(
        400,
        "sendAt must be in the future",
        "INVALID_SCHEDULE",
      );
    }

    // Atomic schedule: only transitions DRAFT|SCHEDULED → SCHEDULED.
    // Prevents race where another operation changes the status between read and write.
    const existing = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, appId: true },
    });
    if (!existing) {
      throw new AppError(404, "Notification not found", "NOT_FOUND");
    }
    assertMachineKeyAppAccess(req, existing.appId);

    const app = await prisma.app.findUnique({ where: { id: existing.appId } });
    if (app?.isKilled) {
      throw new AppError(
        403,
        "App is disabled. Cannot schedule notifications.",
        "APP_KILLED",
      );
    }

    const result = await prisma.notification.updateMany({
      where: {
        id,
        appId: existing.appId,
        status: { in: ["DRAFT", "SCHEDULED"] },
      },
      data: {
        status: "SCHEDULED",
        sendAt: scheduleTime,
      },
    });

    if (result.count === 0) {
      throw new AppError(
        409,
        "Notification can no longer be scheduled (status has changed)",
        "STATE_CONFLICT",
      );
    }

    const notification = await prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new AppError(404, "Notification not found", "NOT_FOUND");
    }

    await logAudit({
      adminUserId: adminUser?.id,
      action: "NOTIFICATION_SCHEDULED",
      resource: "notification",
      resourceId: notification.id,
      appId: notification.appId,
      details: { scheduledFor: scheduleTime.toISOString() },
      ...extractRequestInfo(req),
    });

    sendSuccess(res, notification);
  } catch (error) {
    next(error);
  }
};

export const forceSendNotification = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const adminUser = req.adminUser;

    const existing = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, appId: true, status: true, sendAt: true },
    });
    if (!existing) {
      throw new AppError(404, "Notification not found", "NOT_FOUND");
    }
    assertMachineKeyAppAccess(req, existing.appId);

    const app = await prisma.app.findUnique({ where: { id: existing.appId } });
    if (app?.isKilled) {
      throw new AppError(
        403,
        "App is disabled. Cannot send notifications.",
        "APP_KILLED",
      );
    }

    // Atomic transition: allow SCHEDULED|DRAFT|QUEUED|CANCELLED → QUEUED
    // so paused/stuck notifications can be resumed from history.
    const result = await prisma.notification.updateMany({
      where: {
        id,
        appId: existing.appId,
        status: { in: ["SCHEDULED", "DRAFT", "QUEUED", "CANCELLED"] },
      },
      data: {
        status: "QUEUED",
        sendAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new AppError(
        409,
        "Notification can no longer be force-sent (status has changed)",
        "STATE_CONFLICT",
      );
    }

    const notification = await prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new AppError(404, "Notification not found", "NOT_FOUND");
    }

    await addNotificationToQueue(
      notification.id,
      notification.priority as "LOW" | "NORMAL" | "HIGH",
    );

    await logAudit({
      adminUserId: adminUser?.id,
      action: "NOTIFICATION_FORCE_SENT",
      resource: "notification",
      resourceId: notification.id,
      appId: notification.appId,
      details: {
        previousStatus: existing.status,
        previousSendAt: existing.sendAt,
      },
      ...extractRequestInfo(req),
    });

    sendSuccess(res, {
      notification,
      message: "Notification queued for immediate delivery",
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestNotification = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = testNotificationSchema.parse(req.body);
    const adminUser = req.adminUser;

    const app = await prisma.app.findUnique({
      where: { id: data.appId },
      select: {
        id: true,
        defaultTapActionType: true,
        defaultTapActionValue: true,
        notificationIconUrl: true,
        androidNotificationIcon: true,
      },
    });
    if (!app) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }
    assertMachineKeyAppAccess(req, data.appId);

    const device = await prisma.device.findUnique({
      where: { id: data.deviceId },
      include: { user: true },
    });

    if (!device) {
      throw new AppError(404, "Device not found", "DEVICE_NOT_FOUND");
    }

    if (!device.isActive) {
      throw new AppError(400, "Device is not active", "DEVICE_INACTIVE");
    }

    if (device.user.appId !== data.appId) {
      throw new AppError(
        400,
        "Device does not belong to this app",
        "DEVICE_APP_MISMATCH",
      );
    }

    const resolvedToken = decryptTokenIfNeeded(device.pushToken);

    const normalizedCta = normalizeOpenLinkCta({
      actionUrl: data.actionUrl,
      actions: data.actions,
      data: data.data,
      tapActionType: data.tapActionType,
      defaultTapActionType: app.defaultTapActionType,
      defaultTapActionValue: app.defaultTapActionValue,
      maxActions: 2,
    });
    const messageIcons = resolvePushMessageIcons(app, data.icon);

    const message: PushMessage = {
      token: resolvedToken,
      title: data.title,
      subtitle: data.subtitle,
      body: data.body,
      image: data.image,
      ...messageIcons,
      actionUrl: normalizedCta.actionUrl,
      actions: normalizedCta.actions,
      data: withAppIconData(
        {
          ...normalizedCta.data,
          _test: "true",
        },
        messageIcons.icon,
      ),
    };

    const result = await sendPush(
      device.provider as ProviderType,
      message,
      data.appId,
    );

    await logAudit({
      adminUserId: adminUser?.id,
      action: "NOTIFICATION_TEST_SENT",
      resource: "notification",
      appId: data.appId,
      details: {
        deviceId: data.deviceId,
        provider: device.provider,
        success: result.success,
        error: result.error,
      },
      ...extractRequestInfo(req),
    });

    if (result.success) {
      sendSuccess(res, {
        message: "Test notification sent successfully",
        provider: device.provider,
      });
    } else {
      if (result.invalidToken) {
        await prisma.device.update({
          where: { id: device.id },
          data: {
            isActive: false,
            tokenInvalidAt: new Date(),
          },
        });
      }

      throw new AppError(
        502,
        result.error || "Failed to send test notification",
        "PUSH_FAILED",
      );
    }
  } catch (error) {
    next(error);
  }
};
