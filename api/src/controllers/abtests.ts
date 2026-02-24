/**
 * A/B Testing Controller
 * Handles creation and management of A/B tests
 */

import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../services/database";
import { sendSuccess, sendPaginated, AppError } from "../utils/response";
import { logAudit, extractRequestInfo } from "../services/audit";
import {
  createABTestSchema,
  updateABTestSchema,
  abTestSendTestSchema,
  abTestScheduleLiveSchema,
} from "../schemas/abtests";
import { canAccessAppId } from "../middleware/tenantScope";
import { addNotificationToQueue } from "../services/queue";
import { invalidateCache } from "../middleware/cacheMiddleware";
import { chooseABTestFanoutStrategy } from "../services/abTestFanout";
// Helper to safely get a string from query params
const getQueryString = (val: any): string | undefined => {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  return undefined;
};

const ensureABTestAppAccess = (req: Request, appId: string): void => {
  if (!canAccessAppId(req, appId)) {
    throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
  }
};

const invalidateABTestCaches = async (): Promise<void> => {
  await Promise.all([
    invalidateCache("/ab-tests"),
    invalidateCache("/stats"),
  ]).catch(() => {
    // Best-effort cache invalidation.
  });
};

// Validation schemas

/**
 * Create a new A/B test
 */
export const createABTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = createABTestSchema.parse(req.body);
    const adminUser = req.adminUser;

    // Validate total weight equals 100
    const totalWeight = data.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      throw new AppError(
        400,
        "Variant weights must sum to 100",
        "INVALID_WEIGHTS",
      );
    }

    // Verify app exists
    const app = await prisma.app.findUnique({ where: { id: data.appId } });
    if (!app || !canAccessAppId(req, data.appId)) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }

    // Create the A/B test with variants
    const test = await prisma.aBTest.create({
      data: {
        appId: data.appId,
        name: data.name,
        description: data.description,
        targetingMode: data.targetingMode,
        targetUserIds: data.targetUserIds,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        createdBy: adminUser?.id,
        variants: {
          create: data.variants.map((v) => ({
            name: v.name,
            weight: v.weight,
            title: v.title,
            subtitle: v.subtitle,
            body: v.body,
            image: v.image,
          })),
        },
      },
      include: {
        variants: true,
      },
    });

    await invalidateABTestCaches();
    sendSuccess(res, test, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all A/B tests for an app
 */
export const getABTests = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const appId = getQueryString(req.query.appId);
    const status = getQueryString(req.query.status);
    const page = Math.max(
      1,
      parseInt(getQueryString(req.query.page) || "1", 10),
    );
    const limit = Math.min(
      100,
      Math.max(1, parseInt(getQueryString(req.query.limit) || "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where: any = {};
    if (appId) where.appId = appId;
    if (status) where.status = status;
    if (req.accessibleAppIds !== null && req.accessibleAppIds !== undefined) {
      where.appId = appId
        ? {
            equals: appId,
            in: req.accessibleAppIds,
          }
        : { in: req.accessibleAppIds };
    }

    const [tests, total] = await Promise.all([
      prisma.aBTest.findMany({
        where,
        include: {
          variants: {
            select: {
              id: true,
              name: true,
              weight: true,
              title: true,
              subtitle: true,
              body: true,
              image: true,
              sentCount: true,
              deliveredCount: true,
              failedCount: true,
            },
          },
          _count: {
            select: { assignments: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.aBTest.count({ where }),
    ]);

    const variantToTest = new Map<string, string>();
    const variantIds: string[] = [];
    for (const test of tests) {
      for (const variant of test.variants) {
        if (variant.id) {
          variantToTest.set(variant.id, test.id);
          variantIds.push(variant.id);
        }
      }
    }

    const lastTestedAtByTest = new Map<string, Date>();
    if (variantIds.length > 0) {
      try {
        const notifications = await prisma.notification.findMany({
          where: {
            appId: { in: Array.from(new Set(tests.map((t) => t.appId))) },
            variantId: { in: variantIds },
          },
          select: {
            variantId: true,
            payload: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5000,
        });

        for (const notification of notifications) {
          if (!notification.variantId) continue;
          const phase = (notification.payload as any)?.adhocContent?.data?.abPhase;
          if (phase !== "TEST") continue;
          const testId = variantToTest.get(notification.variantId);
          if (!testId) continue;
          if (!lastTestedAtByTest.has(testId)) {
            lastTestedAtByTest.set(testId, notification.createdAt);
          }
        }
      } catch (error) {
        console.warn("[ABTests] Failed to enrich test-phase metadata", error);
      }
    }

    const enriched = tests.map((test) => ({
      ...test,
      hasTestPhase: lastTestedAtByTest.has(test.id),
      lastTestedAt: lastTestedAtByTest.get(test.id) || null,
    }));

    sendPaginated(res, enriched, total, page, limit);
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single A/B test by ID
 */
export const getABTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    if (!id) {
      throw new AppError(400, "Missing test ID", "MISSING_TEST_ID");
    }

    const test = await prisma.aBTest.findUnique({
      where: { id },
      include: {
        variants: true,
        _count: {
          select: { assignments: true },
        },
      },
    });

    if (!test) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, test.appId);

    sendSuccess(res, test);
  } catch (error) {
    next(error);
  }
};

/**
 * Update an A/B test (only if DRAFT)
 */
export const updateABTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const data = updateABTestSchema.parse(req.body);

    const existing = await prisma.aBTest.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, existing.appId);

    if (existing.status !== "DRAFT") {
      throw new AppError(400, "Can only update DRAFT tests", "TEST_NOT_DRAFT");
    }

    if (data.variants) {
      const totalWeight = data.variants.reduce((sum, v) => sum + v.weight, 0);
      if (totalWeight !== 100) {
        throw new AppError(
          400,
          "Variant weights must sum to 100",
          "INVALID_WEIGHTS",
        );
      }
    }

    const test = await prisma.$transaction(async (tx) => {
      await tx.aBTest.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          targetingMode: data.targetingMode,
          targetUserIds: data.targetUserIds,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        },
      });

      if (data.variants) {
        await tx.aBTestVariant.deleteMany({ where: { testId: id } });
        await tx.aBTestVariant.createMany({
          data: data.variants.map((v) => ({
            testId: id,
            name: v.name,
            weight: v.weight,
            title: v.title,
            subtitle: v.subtitle,
            body: v.body,
            image: v.image,
          })),
        });
      }

      return tx.aBTest.findUnique({
        where: { id },
        include: { variants: true },
      });
    });

    await invalidateABTestCaches();
    sendSuccess(res, test);
  } catch (error) {
    next(error);
  }
};

/**
 * Start an A/B test (change status to ACTIVE)
 */
export const startABTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const existing = await prisma.aBTest.findUnique({
      where: { id },
      include: { variants: true },
    });

    if (!existing) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, existing.appId);

    if (existing.status !== "DRAFT") {
      throw new AppError(400, "Can only start DRAFT tests", "TEST_NOT_DRAFT");
    }

    if (existing.variants.length < 2) {
      throw new AppError(
        400,
        "A/B test needs at least 2 variants",
        "INSUFFICIENT_VARIANTS",
      );
    }

    const test = await prisma.aBTest.update({
      where: { id },
      data: {
        status: "ACTIVE",
        scheduledAt: existing.scheduledAt || new Date(), // Start now if no schedule
      },
      include: {
        variants: true,
      },
    });

    await invalidateABTestCaches();
    sendSuccess(res, test);
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel an A/B test
 */
export const cancelABTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const existing = await prisma.aBTest.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, existing.appId);

    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new AppError(400, "Test is already finished", "TEST_FINISHED");
    }

    const test = await prisma.aBTest.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await invalidateABTestCaches();
    sendSuccess(res, test);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an A/B test (only if DRAFT or CANCELLED)
 */
export const deleteABTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const existing = await prisma.aBTest.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, existing.appId);

    if (existing.status === "ACTIVE" || existing.status === "COMPLETED") {
      throw new AppError(
        400,
        "Cannot delete active or completed tests",
        "CANNOT_DELETE",
      );
    }

    await prisma.aBTest.delete({ where: { id } });

    await invalidateABTestCaches();
    sendSuccess(res, { message: "A/B test deleted" });
  } catch (error) {
    next(error);
  }
};

/**
 * Get A/B test results/statistics
 */
export const getABTestResults = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const test = await prisma.aBTest.findUnique({
      where: { id },
      include: {
        variants: {
          select: {
            id: true,
            name: true,
            weight: true,
            title: true,
            body: true,
            sentCount: true,
            deliveredCount: true,
            failedCount: true,
          },
        },
        _count: {
          select: { assignments: true },
        },
      },
    });

    if (!test) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, test.appId);

    const results = (test as any).variants.map((v: any) => {
      const total = v.sentCount;
      const deliveryRate =
        total > 0 ? Math.round((v.deliveredCount / total) * 100) : 0;

      return {
        variantId: v.id,
        name: v.name,
        weight: v.weight,
        title: v.title,
        body: v.body,
        stats: {
          sent: v.sentCount,
          delivered: v.deliveredCount,
          failed: v.failedCount,
          deliveryRate,
        },
      };
    });

    sendSuccess(res, {
      test: {
        id: test.id,
        name: test.name,
        status: test.status,
        startedAt: test.startedAt,
        completedAt: test.completedAt,
        totalAssignments: test._count.assignments,
      },
      results,
    });
  } catch (error) {
    next(error);
  }
};

export const duplicateABTest = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const adminUser = req.adminUser;
    const { name } = req.body;

    const existing = await prisma.aBTest.findUnique({
      where: { id },
      include: { variants: true },
    });

    if (!existing) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, existing.appId);

    const test = await prisma.aBTest.create({
      data: {
        appId: existing.appId,
        name: name || `${existing.name} (Copy)`,
        description: existing.description,
        status: "DRAFT",
        targetingMode: existing.targetingMode,
        targetUserIds: existing.targetUserIds as any,
        createdBy: adminUser?.id,
        variants: {
          create: existing.variants.map((v) => ({
            name: v.name,
            weight: v.weight,
            title: v.title,
            subtitle: v.subtitle,
            body: v.body,
            image: v.image,
          })),
        },
      },
      include: {
        variants: true,
      },
    });

    await invalidateABTestCaches();
    sendSuccess(res, test, 201);
  } catch (error) {
    next(error);
  }
};

export const saveABTestDraft = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const data = updateABTestSchema.parse(req.body);

    const existing = await prisma.aBTest.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, existing.appId);

    if (existing.status !== "DRAFT") {
      throw new AppError(400, "Can only save DRAFT tests", "TEST_NOT_DRAFT");
    }

    const test = await prisma.aBTest.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        targetingMode: data.targetingMode,
        targetUserIds: data.targetUserIds,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      },
      include: {
        variants: true,
      },
    });

    await invalidateABTestCaches();
    sendSuccess(res, test);
  } catch (error) {
    next(error);
  }
};

/**
 * Send A/B test variants in TEST mode to specific users.
 * Every variant is sent to the same selected users.
 */
export const sendABTestTestPhase = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const data = abTestSendTestSchema.parse(req.body);

    const test = await prisma.aBTest.findUnique({
      where: { id },
      include: { variants: true },
    });
    if (!test) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, test.appId);

    if (test.status === "COMPLETED" || test.status === "CANCELLED") {
      throw new AppError(400, "Cannot test a finished A/B test", "TEST_FINISHED");
    }

    if (test.variants.length < 2) {
      throw new AppError(
        400,
        "A/B test needs at least 2 variants",
        "INSUFFICIENT_VARIANTS",
      );
    }

    const users = await prisma.user.findMany({
      where: {
        appId: test.appId,
        externalUserId: { in: data.userIds },
        deletedAt: null,
      },
      select: { externalUserId: true },
    });
    const validUserIds = users.map((u) => u.externalUserId);

    if (validUserIds.length === 0) {
      throw new AppError(
        400,
        "No valid users found for test phase",
        "NO_VALID_TEST_USERS",
      );
    }

    const strategy = chooseABTestFanoutStrategy(validUserIds.length);
    const batchSize =
      strategy.mode === "direct"
        ? validUserIds.length
        : Math.max(200, strategy.pageSize);

    const created: Array<{
      notificationId: string;
      variantId: string;
      variantName: string;
      usersInBatch: number;
    }> = [];

    for (const variant of test.variants) {
      for (let offset = 0; offset < validUserIds.length; offset += batchSize) {
        const batch = validUserIds.slice(offset, offset + batchSize);
        const notification = await prisma.notification.create({
          data: {
            appId: test.appId,
            type: "campaign",
            status: "QUEUED",
            variantId: variant.id,
            payload: {
              userIds: batch,
              adhocContent: {
                title: variant.title,
                subtitle: variant.subtitle,
                body: variant.body,
                image: variant.image,
                data: {
                  abTestId: test.id,
                  abPhase: "TEST",
                  abVariant: variant.name,
                },
              },
            } as any,
            priority: "HIGH",
            sendAt: new Date(),
            createdBy: req.adminUser?.id,
          },
        });
        await addNotificationToQueue(notification.id, "HIGH");
        created.push({
          notificationId: notification.id,
          variantId: variant.id,
          variantName: variant.name,
          usersInBatch: batch.length,
        });
      }
    }

    await logAudit({
      adminUserId: req.adminUser?.id,
      action: "ABTEST_UPDATED",
      resource: "abtest",
      resourceId: test.id,
      appId: test.appId,
      details: {
        usersCount: validUserIds.length,
        variantsCount: test.variants.length,
        strategy: strategy.mode,
        batchSize,
        notificationsCreated: created.length,
      },
      ...extractRequestInfo(req),
    });

    await invalidateABTestCaches();
    sendSuccess(res, {
      testId: test.id,
      usersCount: validUserIds.length,
      variantsCount: test.variants.length,
      fanoutMode: strategy.mode,
      batchSize,
      notifications: created,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Schedule LIVE A/B test run.
 * This always schedules to ALL users.
 */
export const scheduleABTestLive = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const data = abTestScheduleLiveSchema.parse(req.body);
    const existing = await prisma.aBTest.findUnique({
      where: { id },
      include: { variants: true },
    });

    if (!existing) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, existing.appId);

    if (existing.status !== "DRAFT") {
      throw new AppError(400, "Can only schedule DRAFT tests", "TEST_NOT_DRAFT");
    }
    if (existing.variants.length < 2) {
      throw new AppError(
        400,
        "A/B test needs at least 2 variants",
        "INSUFFICIENT_VARIANTS",
      );
    }

    const sendAt = data.sendAt ? new Date(data.sendAt) : new Date();
    const test = await prisma.aBTest.update({
      where: { id },
      data: {
        status: "ACTIVE",
        targetingMode: "ALL",
        targetUserIds: Prisma.JsonNull,
        scheduledAt: sendAt,
      },
      include: { variants: true },
    });

    await logAudit({
      adminUserId: req.adminUser?.id,
      action: "ABTEST_STARTED",
      resource: "abtest",
      resourceId: test.id,
      appId: test.appId,
      details: {
        scheduledAt: test.scheduledAt?.toISOString(),
        targetingMode: "ALL",
      },
      ...extractRequestInfo(req),
    });

    await invalidateABTestCaches();
    sendSuccess(res, test);
  } catch (error) {
    next(error);
  }
};

/**
 * Delivery history for this A/B test (test + live phases).
 */
export const getABTestHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const test = await prisma.aBTest.findUnique({
      where: { id },
      include: { variants: true },
    });

    if (!test) {
      throw new AppError(404, "A/B test not found", "TEST_NOT_FOUND");
    }
    ensureABTestAppAccess(req, test.appId);

    const variantById = new Map(
      test.variants.map((variant) => [variant.id, variant.name]),
    );
    const variantIds = Array.from(variantById.keys());

    const notifications = await prisma.notification.findMany({
      where: {
        appId: test.appId,
        OR: [
          ...(variantIds.length > 0 ? [{ variantId: { in: variantIds } }] : []),
          {
            payload: {
              path: ["adhocContent", "data", "abTestId"],
              equals: test.id,
            },
          },
        ],
      },
      include: {
        deliveries: {
          include: {
            device: {
              select: {
                id: true,
                platform: true,
                provider: true,
                user: {
                  select: { externalUserId: true },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const history = notifications.map((notification) => {
      const payload = (notification.payload || {}) as any;
      const payloadData = payload?.adhocContent?.data || {};
      const phase = payloadData.abPhase === "TEST" ? "TEST" : "LIVE";
      const variantName = notification.variantId
        ? variantById.get(notification.variantId) || payloadData.abVariant || "Unknown"
        : payloadData.abVariant || "Unknown";

      return {
        notificationId: notification.id,
        phase,
        mode: phase === "TEST" ? "test" : "live",
        variantId: notification.variantId,
        variantName,
        status: notification.status,
        createdAt: notification.createdAt,
        sendAt: notification.sendAt,
        deliveries: notification.deliveries.map((delivery) => ({
          deliveryId: delivery.id,
          userId: delivery.device.user.externalUserId,
          deviceId: delivery.device.id,
          platform: delivery.device.platform,
          provider: delivery.device.provider,
          status: delivery.status,
          sentAt: delivery.sentAt,
          createdAt: delivery.createdAt,
          updatedAt: delivery.updatedAt,
          error: delivery.lastError,
        })),
      };
    });

    sendSuccess(res, {
      testId: test.id,
      history,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Promote a variant as winner (Phase 3)
 * Ends the test and optionally creates a follow-up campaign
 */
export const promoteWinner = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };
    const { variantId, createCampaign } = req.body;
    const adminUser = req.adminUser!;

    const test = await prisma.aBTest.findUnique({
      where: { id },
      include: { variants: true },
    });

    if (!test) throw new AppError(404, "A/B test not found");
    ensureABTestAppAccess(req, test.appId);
    if (test.status !== "ACTIVE")
      throw new AppError(400, "Test must be ACTIVE to promote winner");

    // Find variant
    const variant = (test as any).variants.find((v: any) => v.id === variantId);
    if (!variant) throw new AppError(404, "Variant not found");

    // Close test
    await prisma.aBTest.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    let newCampaign = null;
    if (createCampaign) {
      newCampaign = await prisma.campaign.create({
        data: {
          appId: test.appId,
          name: `Winner of ${test.name}: ${variant.name}`,
          description: `Promoted from A/B Test ${test.name}`,
          targetingMode: "ALL", // Default to ALL or copy test targeting? Usually ALL residue
          title: variant.title,
          subtitle: variant.subtitle,
          body: variant.body,
          image: variant.image,
          priority: "NORMAL",
          status: "DRAFT",
          createdBy: adminUser.id,
        },
      });
    }

    await invalidateABTestCaches();
    sendSuccess(res, {
      testId: test.id,
      winningVariant: variant,
      promotedCampaign: newCampaign,
    });
  } catch (error) {
    next(error);
  }
};
