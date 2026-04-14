import type { Request, Response } from "express";
import webpush from "web-push";
import { prisma } from "../services/database";
import { AppError, sendSuccess } from "../utils/response";
import { encrypt, decrypt } from "../utils/crypto";
import { clearAppProviderCache } from "../services/push-providers";
import { clearCorsOriginCache } from "../services/corsOrigins";
import { invalidateCache } from "../middleware/cacheMiddleware";
import { credentialSchemaMap } from "../schemas/credentials";
import { parseEnvironment } from "../utils/environment";

async function getOrCreateAppEnvironment(appId: string, env: "PROD" | "UAT") {
  const app = await prisma.app.findUnique({
    where: { id: appId },
    select: { id: true },
  });
  if (!app) {
    throw new AppError(404, "App not found", "APP_NOT_FOUND");
  }

  return prisma.appEnvironment.upsert({
    where: { appId_env: { appId, env } },
    update: {},
    create: { appId, env, isEnabled: true },
  });
}

// 1. Create Credential Version
export const createCredentialVersion = async (
  req: Request,
  res: Response,
  next: any,
) => {
  try {
    const { appId, env, provider } = req.params as {
      appId: string;
      env: string;
      provider: string;
    };
    let credentialData = req.body;
    const parsedEnv = parseEnvironment(env);
    if (!parsedEnv) {
      throw new AppError(
        400,
        "Invalid environment. Allowed values: PROD, UAT (aliases: production, staging)",
        "INVALID_ENVIRONMENT",
      );
    }

    // Validate credential data against provider-specific schema
    const schema = credentialSchemaMap[provider];
    if (schema) {
      const result = schema.safeParse(credentialData);
      if (!result.success) {
        const errors = result.error.issues
          .map((i: any) => `${i.path.join(".")}: ${i.message}`)
          .join(", ");
        throw new AppError(
          400,
          `Invalid ${provider} credentials: ${errors}`,
          "VALIDATION_ERROR",
        );
      }

      // Persist normalized/transformed schema output (e.g. web allowedOrigins parsing).
      credentialData = result.data;
    }
    const adminUserId = req.adminUser?.id;

    // 1. Get or Create Credential Container
    const appEnv = await getOrCreateAppEnvironment(appId, parsedEnv);

    let credential = await prisma.credential.findFirst({
      where: { appEnvironmentId: appEnv.id, provider },
    });

    if (!credential) {
      credential = await prisma.credential.create({
        data: {
          appEnvironmentId: appEnv.id,
          provider,
        },
      });
    }

    // 2. Determine next version
    const lastVersion = await prisma.credentialVersion.findFirst({
      where: { credentialId: credential.id },
      orderBy: { version: "desc" },
    });
    const nextVersion = (lastVersion?.version || 0) + 1;

    // 3. Create Version
    const encrypted = encrypt(JSON.stringify(credentialData));

    const version = await prisma.credentialVersion.create({
      data: {
        credentialId: credential.id,
        version: nextVersion,
        encryptedJson: encrypted,
        isActive: false, // Must be manually activated
        createdBy: adminUserId,
      },
    });

    // 4. Audit
    await prisma.auditLog.create({
      data: {
        action: "CREDENTIAL_VERSION_CREATED",
        resource: "credential_version",
        resourceId: version.id,
        appId,
        adminUserId,
        details: { version: nextVersion, provider, env: parsedEnv },
      },
    });

    sendSuccess(
      res,
      {
        id: version.id,
        version: nextVersion,
        createdAt: version.createdAt,
      },
      201,
      "Credential version created",
    );
  } catch (error) {
    next(error);
  }
};

// 2. Get Credentials (List Versions)
export const getCredentials = async (
  req: Request,
  res: Response,
  next: any,
) => {
  try {
    const { appId, env } = req.params as { appId: string; env: string };
    const parsedEnv = parseEnvironment(env);
    if (!parsedEnv) {
      throw new AppError(
        400,
        "Invalid environment. Allowed values: PROD, UAT (aliases: production, staging)",
        "INVALID_ENVIRONMENT",
      );
    }

    await getOrCreateAppEnvironment(appId, parsedEnv);
    const appEnv = await prisma.appEnvironment.findUnique({
      where: { appId_env: { appId, env: parsedEnv } },
      include: {
        credentials: {
          include: {
            versions: {
              orderBy: { version: "desc" },
              take: 5, // Get last 5 versions
            },
          },
        },
      },
    });

    if (!appEnv) {
      throw new AppError(
        500,
        "Failed to resolve app environment",
        "ENV_RESOLVE_FAILED",
      );
    }

    const result = (appEnv as any).credentials.map((cred: any) => {
      const activeVersion = cred.versions.find((v: any) => v.isActive);
      return {
        id: cred.id,
        provider: cred.provider,
        activeVersion: activeVersion
          ? {
              id: activeVersion.id,
              version: activeVersion.version,
              createdAt: activeVersion.createdAt,
              createdBy: activeVersion.createdBy,
            }
          : null,
        versions: cred.versions.map((v: any) => ({
          id: v.id,
          version: v.version,
          isActive: v.isActive,
          createdAt: v.createdAt,
          testRunStatus: "UNKNOWN", // Could fetch last test run status
        })),
      };
    });

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

// 2b. Get safe Web SDK config view data
export const getWebSdkConfig = async (
  req: Request,
  res: Response,
  next: any,
) => {
  try {
    const { appId, env } = req.params as { appId: string; env: string };
    const parsedEnv = parseEnvironment(env);

    if (!parsedEnv) {
      throw new AppError(
        400,
        "Invalid environment. Allowed values: PROD, UAT (aliases: production, staging)",
        "INVALID_ENVIRONMENT",
      );
    }

    await getOrCreateAppEnvironment(appId, parsedEnv);

    const webCredential = await prisma.credential.findFirst({
      where: {
        provider: "web",
        appEnvironment: {
          appId,
          env: parsedEnv,
        },
      },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    let vapidPublicKey: string | null = null;
    let allowedOrigins: string[] = [];
    const activeVersion = webCredential?.versions?.[0];

    if (activeVersion) {
      try {
        const decrypted = JSON.parse(decrypt(activeVersion.encryptedJson));
        if (typeof decrypted?.vapidPublicKey === "string") {
          vapidPublicKey = decrypted.vapidPublicKey;
        }
        if (Array.isArray(decrypted?.allowedOrigins)) {
          allowedOrigins = decrypted.allowedOrigins.filter(
            (origin: unknown) => typeof origin === "string" && origin.length > 0,
          );
        }
      } catch {
        vapidPublicKey = null;
        allowedOrigins = [];
      }
    }

    sendSuccess(res, {
      appId,
      env: parsedEnv,
      hasWebCredential: !!webCredential,
      hasActiveWebCredential: !!activeVersion,
      vapidPublicKey,
      allowedOrigins,
    });
  } catch (error) {
    next(error);
  }
};

// 3. Test Credential Version
export const testCredential = async (
  req: Request,
  res: Response,
  next: any,
) => {
  try {
    const { credentialVersionId } = req.params as {
      credentialVersionId: string;
    };
    const { testToken } = req.body;
    const adminUserId = req.adminUser?.id;

    const version = await prisma.credentialVersion.findUnique({
      where: { id: credentialVersionId },
      include: { credential: true },
    });

    if (!version) {
      throw new AppError(404, "Credential version not found");
    }

    const decryptedCreds = JSON.parse(decrypt(version.encryptedJson));

    // TODO: Actual provider test logic here (refactor provider service to accept creds)
    // For now, simulate success/failure based on token
    let status: "SUCCESS" | "FAILED" = "SUCCESS";
    let errorCode = null;
    let errorMessage = null;

    if (testToken === "simulate_error") {
      status = "FAILED";
      errorCode = "INVALID_TOKEN";
      errorMessage = "The provided token is invalid";
    }

    const testRun = await prisma.credentialTestRun.create({
      data: {
        credentialVersionId: version.id,
        status,
        errorCode,
        errorMessage,
        testedBy: adminUserId,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "CREDENTIAL_TESTED",
        resource: "credential_test_run",
        resourceId: testRun.id,
        adminUserId,
        details: { status, versionId: version.id },
      },
    });

    sendSuccess(res, testRun, 200, "Credential test completed");
  } catch (error) {
    next(error);
  }
};

// 4. Activate Credential Version
export const activateCredential = async (
  req: Request,
  res: Response,
  next: any,
) => {
  try {
    const { credentialVersionId } = req.params as {
      credentialVersionId: string;
    };
    const adminUserId = req.adminUser?.id;

    const version = await prisma.credentialVersion.findUnique({
      where: { id: credentialVersionId },
      include: {
        credential: {
          include: {
            appEnvironment: true,
          },
        },
      },
    });

    if (!version) {
      throw new AppError(404, "Credential version not found");
    }

    // Deactivate others, Activate this one in transaction
    await prisma.$transaction([
      prisma.credentialVersion.updateMany({
        where: {
          credentialId: version.credentialId,
          isActive: true,
        },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
        },
      }),
      prisma.credentialVersion.update({
        where: { id: version.id },
        data: { isActive: true },
      }),
    ]);

    // Clear cache for this provider across all processes via Redis Pub/Sub
    const appId = version.credential.appEnvironment.appId;
    const provider = version.credential.provider as any;
    clearAppProviderCache(appId, provider);
    if (provider === "web") {
      clearCorsOriginCache();
    }

    // Invalidate onboarding cache so portal detects credential setup
    await invalidateCache("/onboarding-status");

    await prisma.auditLog.create({
      data: {
        action: "CREDENTIAL_ACTIVATED",
        resource: "credential_version",
        resourceId: version.id,
        adminUserId,
        details: {
          version: version.version,
          provider: version.credential.provider,
        },
      },
    });

    sendSuccess(
      res,
      {
        activatedVersion: version.version,
      },
      200,
      "Credential activated",
    );
  } catch (error) {
    next(error);
  }
};

// 5. Deactivate all active versions for a credential container
export const deactivateCredential = async (
  req: Request,
  res: Response,
  next: any,
) => {
  try {
    const { credentialId } = req.params as { credentialId: string };
    const adminUserId = req.adminUser?.id;

    const credential = await prisma.credential.findUnique({
      where: { id: credentialId },
      include: { appEnvironment: true },
    });

    if (!credential) {
      throw new AppError(404, "Credential not found", "NOT_FOUND");
    }

    const result = await prisma.credentialVersion.updateMany({
      where: {
        credentialId: credential.id,
        isActive: true,
      },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });

    clearAppProviderCache(
      credential.appEnvironment.appId,
      credential.provider as any,
    );
    if (credential.provider === "web") {
      clearCorsOriginCache();
    }
    await invalidateCache("/onboarding-status");

    await prisma.auditLog.create({
      data: {
        action: "CREDENTIAL_DEACTIVATED",
        resource: "credential",
        resourceId: credential.id,
        appId: credential.appEnvironment.appId,
        adminUserId,
        details: {
          provider: credential.provider,
          deactivatedActiveVersions: result.count,
        },
      },
    });

    sendSuccess(
      res,
      {
        credentialId: credential.id,
        provider: credential.provider,
        deactivatedActiveVersions: result.count,
      },
      200,
      "Credential deactivated",
    );
  } catch (error) {
    next(error);
  }
};

// 6. Delete credential container and all versions
export const deleteCredential = async (
  req: Request,
  res: Response,
  next: any,
) => {
  try {
    const { credentialId } = req.params as { credentialId: string };
    const adminUserId = req.adminUser?.id;

    const credential = await prisma.credential.findUnique({
      where: { id: credentialId },
      include: {
        appEnvironment: true,
        _count: { select: { versions: true } },
      },
    });

    if (!credential) {
      throw new AppError(404, "Credential not found", "NOT_FOUND");
    }

    await prisma.credential.delete({ where: { id: credential.id } });

    clearAppProviderCache(
      credential.appEnvironment.appId,
      credential.provider as any,
    );
    if (credential.provider === "web") {
      clearCorsOriginCache();
    }
    await invalidateCache("/onboarding-status");

    await prisma.auditLog.create({
      data: {
        action: "CREDENTIAL_DELETED",
        resource: "credential",
        resourceId: credential.id,
        appId: credential.appEnvironment.appId,
        adminUserId,
        details: {
          provider: credential.provider,
          deletedVersions: credential._count.versions,
        },
      },
    });

    sendSuccess(
      res,
      {
        credentialId: credential.id,
        provider: credential.provider,
        deletedVersions: credential._count.versions,
      },
      200,
      "Credential deleted",
    );
  } catch (error) {
    next(error);
  }
};

// 7. Generate VAPID Keys
export const generateVapidKeys = async (
  req: Request,
  res: Response,
  next: any,
) => {
  try {
    const adminUser = req.adminUser;
    const { publicKey: vapidPublicKey, privateKey: vapidPrivateKey } =
      webpush.generateVAPIDKeys();

    // Auto-generate subject from admin user email
    const subject = adminUser?.email
      ? `mailto:${adminUser.email}`
      : "mailto:admin@example.com";

    sendSuccess(
      res,
      {
        vapidPublicKey,
        vapidPrivateKey,
        subject,
      },
      200,
      "VAPID keys generated successfully",
    );
  } catch (error) {
    next(error);
  }
};
