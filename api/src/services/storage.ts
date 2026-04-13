import { Client } from "minio";
import fs from "fs";

type StorageConfig = {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
};

function isRunningInContainer(): boolean {
  return fs.existsSync("/.dockerenv") || fs.existsSync("/run/.containerenv");
}

function parseEndpoint(rawEndpoint: string): {
  endPoint: string;
  port?: number;
  useSSL?: boolean;
} {
  const trimmed = rawEndpoint.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const parsed = new URL(trimmed);
    return {
      endPoint: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : undefined,
      useSSL: parsed.protocol === "https:",
    };
  }

  // Allow values like "minio/" or "storage.example.com/path".
  return { endPoint: trimmed.split("/")[0] || "localhost" };
}

function getHostnameFromUrl(urlValue?: string): string | undefined {
  if (!urlValue?.trim()) {
    return undefined;
  }

  try {
    return new URL(urlValue.trim()).hostname;
  } catch {
    return undefined;
  }
}

function buildStorageConfig(): StorageConfig {
  const endpointInput = process.env.MINIO_ENDPOINT || "localhost";
  const parsedEndpoint = parseEndpoint(endpointInput);
  const runningInContainer = isRunningInContainer();

  let endPoint = parsedEndpoint.endPoint || "localhost";
  if (!runningInContainer && endPoint === "minio") {
    // `minio` is usually only resolvable inside a compose network.
    // Fall back to localhost for host-run API processes.
    endPoint = "localhost";
  }

  const assetPublicHost = getHostnameFromUrl(process.env.ASSET_PUBLIC_BASE_URL);
  const disableInternalFallback =
    (process.env.MINIO_DISABLE_INTERNAL_FALLBACK || "false") === "true";
  const shouldUseInternalApiFallback =
    runningInContainer &&
    !disableInternalFallback &&
    !!assetPublicHost &&
    endPoint === assetPublicHost;

  if (shouldUseInternalApiFallback) {
    // If MINIO_ENDPOINT points to the public asset host from inside a container,
    // prefer internal API service networking to avoid console/proxy endpoint mixups.
    endPoint = process.env.MINIO_INTERNAL_ENDPOINT || "minio";
  }

  const rawPort = process.env.MINIO_PORT?.trim();
  const envPort = rawPort ? Number(rawPort) : undefined;
  const internalPortRaw = process.env.MINIO_INTERNAL_PORT?.trim();
  const internalPort = internalPortRaw ? Number(internalPortRaw) : 9000;
  const internalUseSSL =
    (process.env.MINIO_INTERNAL_USE_SSL || "false") === "true";
  const fallbackPortByProtocol =
    parsedEndpoint.useSSL === true
      ? 443
      : parsedEndpoint.useSSL === false
        ? 80
        : undefined;

  return {
    endPoint,
    port: shouldUseInternalApiFallback
      ? internalPort
      : parsedEndpoint.port || envPort || fallbackPortByProtocol || 9000,
    useSSL: shouldUseInternalApiFallback
      ? internalUseSSL
      : (parsedEndpoint.useSSL ??
        (process.env.MINIO_USE_SSL || "false") === "true"),
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    bucket: process.env.MINIO_BUCKET || "notifyx-assets",
  };
}

const config = buildStorageConfig();

export const minioClient = new Client(config);

export async function ensureBucket() {
  try {
    const exists = await minioClient.bucketExists(config.bucket);
    if (!exists) {
      await minioClient.makeBucket(config.bucket, "us-east-1"); // Region is required but often ignored for local

      // make public read (optional, depends on requirement, usually assets are public)
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Action: ["s3:GetObject"],
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Resource: [`arn:aws:s3:::${config.bucket}/*`],
          },
        ],
      };
      await minioClient.setBucketPolicy(config.bucket, JSON.stringify(policy));
    }
  } catch (error) {
    console.error("Failed to ensure MinIO bucket:", error);
  }
}

// Initialize bucket on startup
ensureBucket();

export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  mimetype: string,
): Promise<string> {
  const objectName = `${Date.now()}-${fileName}`;

  try {
    await minioClient.putObject(
      config.bucket,
      objectName,
      fileBuffer,
      fileBuffer.length,
      {
        "Content-Type": mimetype,
      },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const apiPortHint = reason.includes(
      "S3 API Requests must be made to API port",
    )
      ? " It looks like this endpoint is pointing to MinIO Console (9001) instead of S3 API (9000)."
      : "";
    throw new Error(
      `Storage upload failed. Check MINIO endpoint (${config.endPoint}:${config.port}) and credentials.${apiPortHint} ${reason}`,
    );
  }

  // Return public URL (override host for real devices if provided)
  const publicBase = process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (publicBase) {
    return `${publicBase}/${config.bucket}/${objectName}`;
  }

  const protocol = config.useSSL ? "https" : "http";
  return `${protocol}://${config.endPoint}:${config.port}/${config.bucket}/${objectName}`;
}

export async function getFileStream(
  objectName: string,
): Promise<NodeJS.ReadableStream> {
  return await minioClient.getObject(config.bucket, objectName);
}
