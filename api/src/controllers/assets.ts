/**
 * Assets Controller
 * Handles file uploads (CSV, Images) to MinIO/S3
 */

import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import { uploadFileWithUrls } from "../services/storage";
import { sendSuccess, AppError } from "../utils/response";
import crypto from "crypto";

export const uploadAsset = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.file) {
      throw new AppError(400, "No file uploaded", "NO_FILE");
    }

    const { buffer, originalname, mimetype, size } = req.file;
    const adminUser = req.adminUser;
    const machineAuth = req.machineAuth;
    const appId = req.body.appId || machineAuth?.appId;

    if (!adminUser && !machineAuth) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    if (!appId) {
      throw new AppError(400, "appId is required", "MISSING_APP_ID");
    }

    // Determine asset type
    let type: "CSV_AUDIENCE" | "IMAGE" | "OTHER" = "OTHER";
    if (mimetype === "text/csv" || mimetype === "application/vnd.ms-excel") {
      type = "CSV_AUDIENCE";
    } else if (mimetype.startsWith("image/")) {
      type = "IMAGE";
    }

    // Get App Policy explicitly if needed, or assume defaults/middleware checked limits
    const appPolicy = await prisma.appPolicy.findUnique({ where: { appId } });

    const csvLimit = appPolicy?.csvMaxSizeBytes || 5 * 1024 * 1024; // 5MB default
    const imageLimit = appPolicy?.imageMaxSizeBytes || 2 * 1024 * 1024; // 2MB default

    if (type === "CSV_AUDIENCE" && size > csvLimit) {
      throw new AppError(
        400,
        `CSV file too large (max ${csvLimit} bytes)`,
        "FILE_TOO_LARGE",
      );
    }
    if (type === "IMAGE" && size > imageLimit) {
      throw new AppError(
        400,
        `Image file too large (max ${imageLimit} bytes)`,
        "FILE_TOO_LARGE",
      );
    }

    // Upload to storage
    const uploaded = await uploadFileWithUrls(buffer, originalname, mimetype);
    const url = uploaded.url;

    // Calculate SHA256
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    // Create Asset record
    const asset = await prisma.asset.create({
      data: {
        orgId: adminUser?.orgIds?.[0], // Might be null for machine keys
        appId,
        type,
        url,
        mimeType: mimetype,
        size,
        sha256,
        createdBy: adminUser?.id || machineAuth?.keyId || "system",
      },
    });

    sendSuccess(
      res,
      {
        ...asset,
        publicUrl: uploaded.url,
        presignedUrl: uploaded.presignedUrl,
        objectKey: uploaded.objectName,
      },
      201,
    );
  } catch (error) {
    next(error);
  }
};

export const getAsset = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params as { id: string };

    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      throw new AppError(404, "Asset not found", "ASSET_NOT_FOUND");
    }

    sendSuccess(res, asset);
  } catch (error) {
    next(error);
  }
};
