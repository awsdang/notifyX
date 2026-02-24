import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import {
  createTemplateSchema,
  updateTemplateSchema,
} from "../schemas/templates";
import { sendSuccess, AppError } from "../utils/response";
import { canAccessAppId } from "../middleware/tenantScope";
import { invalidateCache } from "../middleware/cacheMiddleware";

function toEventName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || `template_${Date.now()}`;
}

export const createTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = createTemplateSchema.parse(req.body);

    if (!canAccessAppId(req, data.appId)) {
      throw new AppError(403, "Insufficient permissions", "FORBIDDEN");
    }

    const type = data.type || "transactional";
    const language = data.language || "en";
    const sourceName = data.eventName || data.name || data.title;
    const eventName = toEventName(sourceName);

    const template = await prisma.notificationTemplate.create({
      data: {
        appId: data.appId,
        type,
        eventName,
        language,
        title: data.title,
        subtitle: data.subtitle,
        body: data.body,
        image: data.image,
        variables: data.variables || [],
      },
    });

    await invalidateCache("/templates");
    sendSuccess(res, template, 201);
  } catch (error) {
    next(error);
  }
};

export const getTemplates = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId } = req.query;
    const where: any = appId ? { appId: String(appId) } : {};

    if (req.accessibleAppIds !== null && req.accessibleAppIds !== undefined) {
      where.appId = appId
        ? {
            equals: String(appId),
            in: req.accessibleAppIds,
          }
        : { in: req.accessibleAppIds };
    }

    const templates = await prisma.notificationTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(res, templates);
  } catch (error) {
    next(error);
  }
};

export const getTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const template = await prisma.notificationTemplate.findUnique({
      where: { id: String(id) },
    });
    if (!template) {
      throw new AppError(404, "Template not found");
    }

    if (!canAccessAppId(req, template.appId)) {
      throw new AppError(404, "Template not found");
    }

    sendSuccess(res, template);
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;
  try {
    const data = updateTemplateSchema.parse(req.body);
    const existing = await prisma.notificationTemplate.findUnique({
      where: { id: String(id) },
      select: { appId: true },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Template not found");
    }

    const template = await prisma.notificationTemplate.update({
      where: { id: String(id) },
      data,
    });
    await invalidateCache("/templates");
    sendSuccess(res, template);
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;
  try {
    const existing = await prisma.notificationTemplate.findUnique({
      where: { id: String(id) },
      select: { appId: true },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Template not found");
    }

    const deleted = await prisma.notificationTemplate.delete({
      where: { id: String(id) },
    });
    await invalidateCache("/templates");
    sendSuccess(res, { id: deleted.id }, 200, "Template deleted");
  } catch (error) {
    next(error);
  }
};
