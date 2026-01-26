/**
 * A/B Testing Controller
 * Handles creation and management of A/B tests
 */

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database';
import { sendSuccess, AppError } from '../utils/response';
import { logAudit, extractRequestInfo } from '../services/audit';
import { createABTestSchema, updateABTestSchema } from '../schemas/abtests';
// Helper to safely get a string from query params
const getQueryString = (val: any): string | undefined => {
    if (typeof val === 'string') return val;
    if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
    return undefined;
};

// Validation schemas

/**
 * Create a new A/B test
 */
export const createABTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = createABTestSchema.parse(req.body);
        const adminUser = (req as any).adminUser;

        // Validate total weight equals 100
        const totalWeight = data.variants.reduce((sum, v) => sum + v.weight, 0);
        if (totalWeight !== 100) {
            throw new AppError(400, 'Variant weights must sum to 100', 'INVALID_WEIGHTS');
        }

        // Verify app exists
        const app = await prisma.app.findUnique({ where: { id: data.appId } });
        if (!app) {
            throw new AppError(404, 'App not found', 'APP_NOT_FOUND');
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
                    create: data.variants.map(v => ({
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

        sendSuccess(res, test, 201);
    } catch (error) {
        next(error);
    }
};

/**
 * Get all A/B tests for an app
 */
export const getABTests = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const appId = getQueryString(req.query.appId);
        const status = getQueryString(req.query.status);

        const where: any = {};
        if (appId) where.appId = appId;
        if (status) where.status = status;

        const tests = await prisma.aBTest.findMany({
            where,
            include: {
                variants: {
                    select: {
                        id: true,
                        name: true,
                        weight: true,
                        title: true,
                        sentCount: true,
                        deliveredCount: true,
                        failedCount: true,
                    },
                },
                _count: {
                    select: { assignments: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        sendSuccess(res, tests);
    } catch (error) {
        next(error);
    }
};

/**
 * Get a single A/B test by ID
 */
export const getABTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };

        if (!id) {
            throw new AppError(400, 'Missing test ID', 'MISSING_TEST_ID');
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
            throw new AppError(404, 'A/B test not found', 'TEST_NOT_FOUND');
        }

        sendSuccess(res, test);
    } catch (error) {
        next(error);
    }
};

/**
 * Update an A/B test (only if DRAFT)
 */
export const updateABTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const data = updateABTestSchema.parse(req.body);

        const existing = await prisma.aBTest.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'A/B test not found', 'TEST_NOT_FOUND');
        }

        if (existing.status !== 'DRAFT') {
            throw new AppError(400, 'Can only update DRAFT tests', 'TEST_NOT_DRAFT');
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

        sendSuccess(res, test);
    } catch (error) {
        next(error);
    }
};

/**
 * Start an A/B test (change status to ACTIVE)
 */
export const startABTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };

        const existing = await prisma.aBTest.findUnique({
            where: { id },
            include: { variants: true },
        });

        if (!existing) {
            throw new AppError(404, 'A/B test not found', 'TEST_NOT_FOUND');
        }

        if (existing.status !== 'DRAFT') {
            throw new AppError(400, 'Can only start DRAFT tests', 'TEST_NOT_DRAFT');
        }

        if (existing.variants.length < 2) {
            throw new AppError(400, 'A/B test needs at least 2 variants', 'INSUFFICIENT_VARIANTS');
        }

        const test = await prisma.aBTest.update({
            where: { id },
            data: {
                status: 'ACTIVE',
                scheduledAt: existing.scheduledAt || new Date(), // Start now if no schedule
            },
            include: {
                variants: true,
            },
        });

        sendSuccess(res, test);
    } catch (error) {
        next(error);
    }
};

/**
 * Cancel an A/B test
 */
export const cancelABTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };

        const existing = await prisma.aBTest.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'A/B test not found', 'TEST_NOT_FOUND');
        }

        if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
            throw new AppError(400, 'Test is already finished', 'TEST_FINISHED');
        }

        const test = await prisma.aBTest.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });

        sendSuccess(res, test);
    } catch (error) {
        next(error);
    }
};

/**
 * Delete an A/B test (only if DRAFT or CANCELLED)
 */
export const deleteABTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };

        const existing = await prisma.aBTest.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'A/B test not found', 'TEST_NOT_FOUND');
        }

        if (existing.status === 'ACTIVE' || existing.status === 'COMPLETED') {
            throw new AppError(400, 'Cannot delete active or completed tests', 'CANNOT_DELETE');
        }

        await prisma.aBTest.delete({ where: { id } });

        sendSuccess(res, { message: 'A/B test deleted' });
    } catch (error) {
        next(error);
    }
};

/**
 * Get A/B test results/statistics
 */
export const getABTestResults = async (req: Request, res: Response, next: NextFunction) => {
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
            throw new AppError(404, 'A/B test not found', 'TEST_NOT_FOUND');
        }

        const results = (test as any).variants.map((v: any) => {
            const total = v.sentCount;
            const deliveryRate = total > 0 ? Math.round((v.deliveredCount / total) * 100) : 0;

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

export const duplicateABTest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const adminUser = (req as any).adminUser;
        const { name } = req.body;

        const existing = await prisma.aBTest.findUnique({
            where: { id },
            include: { variants: true },
        });

        if (!existing) {
            throw new AppError(404, 'A/B test not found', 'TEST_NOT_FOUND');
        }

        const test = await prisma.aBTest.create({
            data: {
                appId: existing.appId,
                name: name || `${existing.name} (Copy)`,
                description: existing.description,
                status: 'DRAFT',
                targetingMode: existing.targetingMode,
                targetUserIds: existing.targetUserIds as any,
                createdBy: adminUser?.id,
                variants: {
                    create: existing.variants.map(v => ({
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

        sendSuccess(res, test, 201);
    } catch (error) {
        next(error);
    }
};

export const saveABTestDraft = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const data = updateABTestSchema.parse(req.body);

        const existing = await prisma.aBTest.findUnique({ where: { id } });
        if (!existing) {
            throw new AppError(404, 'A/B test not found', 'TEST_NOT_FOUND');
        }

        if (existing.status !== 'DRAFT') {
            throw new AppError(400, 'Can only save DRAFT tests', 'TEST_NOT_DRAFT');
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

        sendSuccess(res, test);
    } catch (error) {
        next(error);
    }
};

/**
 * Promote a variant as winner (Phase 3)
 * Ends the test and optionally creates a follow-up campaign
 */
export const promoteWinner = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params as { id: string };
        const { variantId, createCampaign } = req.body;
        const adminUser = (req as any).adminUser;

        const test = await prisma.aBTest.findUnique({
            where: { id },
            include: { variants: true }
        });

        if (!test) throw new AppError(404, 'A/B test not found');
        if (test.status !== 'ACTIVE') throw new AppError(400, 'Test must be ACTIVE to promote winner');

        // Find variant
        const variant = (test as any).variants.find((v: any) => v.id === variantId);
        if (!variant) throw new AppError(404, 'Variant not found');

        // Close test
        await prisma.aBTest.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                completedAt: new Date()
            }
        });

        let newCampaign = null;
        if (createCampaign) {
            newCampaign = await prisma.campaign.create({
                data: {
                    appId: test.appId,
                    name: `Winner of ${test.name}: ${variant.name}`,
                    description: `Promoted from A/B Test ${test.name}`,
                    targetingMode: 'ALL', // Default to ALL or copy test targeting? Usually ALL residue
                    title: variant.title,
                    subtitle: variant.subtitle,
                    body: variant.body,
                    image: variant.image,
                    priority: 'NORMAL',
                    status: 'DRAFT',
                    createdBy: adminUser.id
                }
            });
        }

        sendSuccess(res, {
            testId: test.id,
            winningVariant: variant,
            promotedCampaign: newCampaign
        });

    } catch (error) { next(error); }
};
