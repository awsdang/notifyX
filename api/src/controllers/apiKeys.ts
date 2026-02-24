import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../services/database";
import { AppError, sendSuccess } from "../utils/response";
import { hashApiKey } from "../middleware/auth";
import { createApiKeySchema, rotateApiKeySchema } from "../schemas/apiKeys";

const prismaClient = prisma as any;

function generateRawApiKey(): string {
  const random = crypto.randomBytes(24).toString("base64url");
  return `nk_live_${random}`;
}

export const listApiKeys = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId } = req.params;

    const keys = await prismaClient.apiKey.findMany({
      where: { appId: String(appId) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        createdBy: true,
        rotatedFromId: true,
      },
    });

    sendSuccess(res, keys);
  } catch (error) {
    next(error);
  }
};

export const createApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId } = req.params;
    const adminUser = req.adminUser;
    const data = createApiKeySchema.parse(req.body);

    const app = await prisma.app.findUnique({
      where: { id: String(appId) },
      select: { id: true, orgId: true },
    });
    if (!app) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }

    const rawKey = generateRawApiKey();
    const keyHash = hashApiKey(rawKey);

    const created = await prismaClient.apiKey.create({
      data: {
        appId: app.id,
        orgId: app.orgId,
        name: data.name,
        keyHash,
        scopes: data.scopes ?? [],
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdBy: adminUser?.id,
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        isActive: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    sendSuccess(
      res,
      {
        ...created,
        apiKey: rawKey,
      },
      201,
      "API key created. Save the raw key now; it will not be shown again.",
    );
  } catch (error) {
    next(error);
  }
};

export const revokeApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId, keyId } = req.params;

    const updated = await prismaClient.apiKey.updateMany({
      where: {
        id: String(keyId),
        appId: String(appId),
        isActive: true,
      },
      data: { isActive: false },
    });

    if (updated.count === 0) {
      throw new AppError(404, "API key not found", "API_KEY_NOT_FOUND");
    }

    sendSuccess(res, { keyId, revoked: true });
  } catch (error) {
    next(error);
  }
};

export const rotateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId, keyId } = req.params;
    const adminUser = req.adminUser;
    const data = rotateApiKeySchema.parse(req.body);

    const existing = await prismaClient.apiKey.findFirst({
      where: {
        id: String(keyId),
        appId: String(appId),
      },
      select: {
        id: true,
        appId: true,
        orgId: true,
        name: true,
        scopes: true,
      },
    });

    if (!existing) {
      throw new AppError(404, "API key not found", "API_KEY_NOT_FOUND");
    }

    const rawKey = generateRawApiKey();
    const keyHash = hashApiKey(rawKey);

    const result = await prisma.$transaction(async (tx) => {
      await (tx as any).apiKey.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      return (tx as any).apiKey.create({
        data: {
          appId: existing.appId,
          orgId: existing.orgId,
          name: data.name ?? `${existing.name} (rotated)`,
          keyHash,
          scopes: data.scopes ?? existing.scopes,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          createdBy: adminUser?.id,
          rotatedFromId: existing.id,
        },
        select: {
          id: true,
          name: true,
          scopes: true,
          isActive: true,
          expiresAt: true,
          createdAt: true,
          rotatedFromId: true,
        },
      });
    });

    sendSuccess(
      res,
      {
        ...result,
        apiKey: rawKey,
      },
      201,
      "API key rotated. Save the new raw key now; it will not be shown again.",
    );
  } catch (error) {
    next(error);
  }
};
