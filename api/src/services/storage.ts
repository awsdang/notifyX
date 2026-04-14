import { Client } from "minio";
import fs from "fs";

type StorageConfig = {
  source: string;
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
};

function isTrue(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value === "true" || value === "1";
}

function buildPublicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: ["s3:GetObject"],
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

function encodeObjectPath(objectName: string): string {
  return objectName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 60 * 60;
const MAX_PRESIGNED_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

function getPresignedExpirySeconds(): number {
  const raw = Number(
    process.env.ASSET_PRESIGNED_EXPIRY_SECONDS ||
      DEFAULT_PRESIGNED_EXPIRY_SECONDS,
  );

  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_PRESIGNED_EXPIRY_SECONDS;
  }

  return Math.min(Math.floor(raw), MAX_PRESIGNED_EXPIRY_SECONDS);
}

const CONNECTIVITY_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
]);

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

  return { endPoint: trimmed };
}

function buildStorageConfig(
  endpointInput: string,
  source: string,
  fallbackPortInput?: string,
  fallbackUseSSLInput?: string,
): StorageConfig {
  const parsedEndpoint = parseEndpoint(endpointInput);

  let endPoint = parsedEndpoint.endPoint || "localhost";
  if (!isRunningInContainer() && endPoint === "minio") {
    // `minio` is usually only resolvable inside a compose network.
    // Fall back to localhost for host-run API processes.
    endPoint = "localhost";
  }

  return {
    source,
    endPoint,
    port:
      parsedEndpoint.port ||
      Number(fallbackPortInput || process.env.MINIO_PORT || 9000),
    useSSL:
      parsedEndpoint.useSSL ??
      (fallbackUseSSLInput || process.env.MINIO_USE_SSL || "false") === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    bucket: process.env.MINIO_BUCKET || "notifyx-assets",
  };
}

function configKey(config: StorageConfig): string {
  const scheme = config.useSSL ? "https" : "http";
  return `${scheme}://${config.endPoint}:${config.port}`;
}

function buildStorageFallbackConfigs(): StorageConfig[] {
  const endpointInput = process.env.MINIO_ENDPOINT || "localhost";
  const internalEndpointInput = process.env.MINIO_INTERNAL_ENDPOINT;
  const disableFallback =
    (process.env.MINIO_DISABLE_INTERNAL_FALLBACK || "false") === "true";

  const primaryConfig = internalEndpointInput
    ? buildStorageConfig(
        internalEndpointInput,
        "MINIO_INTERNAL_ENDPOINT",
        process.env.MINIO_INTERNAL_PORT,
        process.env.MINIO_INTERNAL_USE_SSL,
      )
    : buildStorageConfig(endpointInput, "MINIO_ENDPOINT");

  if (disableFallback) {
    return [primaryConfig];
  }

  const candidates: StorageConfig[] = [primaryConfig];

  if (internalEndpointInput) {
    candidates.push(buildStorageConfig(endpointInput, "MINIO_ENDPOINT"));
  }

  const parsedExternalEndpoint = parseEndpoint(endpointInput);
  if (!isRunningInContainer() && parsedExternalEndpoint.endPoint === "minio") {
    candidates.push(
      buildStorageConfig(
        "localhost",
        "AUTO_HOST_LOCAL_FALLBACK",
        process.env.MINIO_PORT,
        process.env.MINIO_USE_SSL,
      ),
    );
  }

  if (
    isRunningInContainer() &&
    parsedExternalEndpoint.endPoint === "localhost"
  ) {
    candidates.push(
      buildStorageConfig(
        "minio",
        "AUTO_CONTAINER_DNS_FALLBACK",
        process.env.MINIO_PORT,
        process.env.MINIO_USE_SSL,
      ),
    );
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = configKey(candidate);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isConnectivityError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";

  if (code && CONNECTIVITY_ERROR_CODES.has(code)) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /Unable to connect|getaddrinfo|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i.test(
    message,
  );
}

const storageConfigs = buildStorageFallbackConfigs();
if (storageConfigs.length === 0) {
  storageConfigs.push(buildStorageConfig("localhost", "AUTO_DEFAULT"));
}
let activeStorageConfig: StorageConfig =
  storageConfigs[0] ?? buildStorageConfig("localhost", "AUTO_DEFAULT");
const minioClients = new Map<string, Client>();

function getClient(config: StorageConfig): Client {
  const key = configKey(config);
  const existing = minioClients.get(key);
  if (existing) {
    return existing;
  }

  const client = new Client({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
  minioClients.set(key, client);
  return client;
}

function orderedConfigs(): StorageConfig[] {
  const activeKey = configKey(activeStorageConfig);
  return [
    activeStorageConfig,
    ...storageConfigs.filter((candidate) => configKey(candidate) !== activeKey),
  ];
}

function buildPublicObjectUrl(
  config: StorageConfig,
  objectName: string,
): string {
  const publicBase = process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const objectPath = encodeObjectPath(objectName);
  if (publicBase) {
    return `${publicBase}/${config.bucket}/${objectPath}`;
  }

  const protocol = config.useSSL ? "https" : "http";
  return `${protocol}://${config.endPoint}:${config.port}/${config.bucket}/${objectPath}`;
}

function resolvePresignConfig(baseConfig: StorageConfig): StorageConfig {
  const presignEndpointInput =
    process.env.MINIO_PRESIGN_ENDPOINT?.trim() ||
    process.env.ASSET_PUBLIC_BASE_URL?.trim();

  if (!presignEndpointInput) {
    return baseConfig;
  }

  const parsed = parseEndpoint(presignEndpointInput);
  if (!parsed.endPoint) {
    return baseConfig;
  }

  const useSSL = parsed.useSSL ?? baseConfig.useSSL;
  const port = parsed.port || (useSSL ? 443 : 80);

  return {
    ...baseConfig,
    source: process.env.MINIO_PRESIGN_ENDPOINT
      ? "MINIO_PRESIGN_ENDPOINT"
      : "ASSET_PUBLIC_BASE_URL",
    endPoint: parsed.endPoint,
    port,
    useSSL,
  };
}

async function buildPresignedObjectUrl(
  config: StorageConfig,
  objectName: string,
): Promise<string> {
  const presignConfig = resolvePresignConfig(config);
  const expiresSeconds = getPresignedExpirySeconds();
  return await getClient(presignConfig).presignedGetObject(
    presignConfig.bucket,
    objectName,
    expiresSeconds,
  );
}

function parseStorageUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function collectKnownStorageHosts(): Set<string> {
  const hosts = new Set<string>();

  const addHost = (host: string) => {
    const normalized = host.trim().toLowerCase();
    if (normalized) {
      hosts.add(normalized);
    }
  };

  for (const config of [activeStorageConfig, ...storageConfigs]) {
    addHost(config.endPoint);
    addHost(`${config.endPoint}:${config.port}`);
  }

  const optionalEndpoints = [
    process.env.ASSET_PUBLIC_BASE_URL,
    process.env.MINIO_PRESIGN_ENDPOINT,
    process.env.MINIO_ENDPOINT,
    process.env.MINIO_INTERNAL_ENDPOINT,
  ];

  for (const endpoint of optionalEndpoints) {
    if (!endpoint) continue;
    const parsed = parseEndpoint(endpoint);
    if (!parsed.endPoint) continue;
    addHost(parsed.endPoint);
    if (parsed.port) {
      addHost(`${parsed.endPoint}:${parsed.port}`);
    }
  }

  return hosts;
}

function tryDecodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function extractObjectNameFromStorageUrl(url: string): string | null {
  const parsed = parseStorageUrl(url);
  if (!parsed) {
    return null;
  }

  const knownHosts = collectKnownStorageHosts();
  const host = parsed.host.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  if (!knownHosts.has(host) && !knownHosts.has(hostname)) {
    return null;
  }

  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const bucket = activeStorageConfig.bucket;
  if (pathSegments.length < 2 || pathSegments[0] !== bucket) {
    return null;
  }

  return pathSegments.slice(1).map(tryDecodePathSegment).join("/");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export async function presignObjectName(objectName: string): Promise<string> {
  const presignResult = await withStorageFallback(
    "presign",
    async (_client, config) => {
      return await buildPresignedObjectUrl(config, objectName);
    },
  );
  return presignResult.result;
}

export async function presignStorageUrl(url: string): Promise<string> {
  const objectName = extractObjectNameFromStorageUrl(url);
  if (!objectName) {
    return url;
  }

  try {
    return await presignObjectName(objectName);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[storage] Could not presign URL ${url}. ${reason}`);
    return url;
  }
}

async function presignUrlsInValue(
  value: unknown,
  seen: WeakSet<object>,
): Promise<unknown> {
  if (typeof value === "string") {
    return await presignStorageUrl(value);
  }

  if (Array.isArray(value)) {
    const transformed = await Promise.all(
      value.map((item) => presignUrlsInValue(item, seen)),
    );
    return transformed;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (!isPlainObject(value)) {
    return value;
  }

  const entries = Object.entries(value);
  const transformedEntries = await Promise.all(
    entries.map(async ([key, item]) => {
      const transformed = await presignUrlsInValue(item, seen);
      return [key, transformed] as const;
    }),
  );

  return Object.fromEntries(transformedEntries);
}

export async function presignStorageUrlsInPayload<T>(payload: T): Promise<T> {
  return (await presignUrlsInValue(payload, new WeakSet<object>())) as T;
}

async function withStorageFallback<T>(
  operation: string,
  runner: (client: Client, config: StorageConfig) => Promise<T>,
): Promise<{ result: T; config: StorageConfig }> {
  const candidates = orderedConfigs();

  for (const [index, candidate] of candidates.entries()) {
    const endpoint = `${candidate.endPoint}:${candidate.port}`;
    const hasNext = index < candidates.length - 1;

    try {
      const result = await runner(getClient(candidate), candidate);
      if (configKey(candidate) !== configKey(activeStorageConfig)) {
        console.warn(
          `[storage] Fallback activated for ${operation}. Using ${candidate.source} (${endpoint}).`,
        );
      }
      activeStorageConfig = candidate;
      return { result, config: candidate };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!hasNext || !isConnectivityError(error)) {
        throw new Error(
          `Storage ${operation} failed on ${endpoint} (${candidate.source}). ${reason}`,
        );
      }

      console.warn(
        `[storage] ${operation} failed on ${endpoint} (${candidate.source}). Trying next endpoint. ${reason}`,
      );
    }
  }

  throw new Error(
    `Storage ${operation} failed: no endpoint candidates available`,
  );
}

export const minioClient = getClient(activeStorageConfig);

export async function ensureBucket() {
  try {
    await withStorageFallback("bucket init", async (client, config) => {
      const exists = await client.bucketExists(config.bucket);
      if (!exists) {
        await client.makeBucket(config.bucket, "us-east-1"); // Region is required but often ignored for local
      }

      // Keep this enabled by default so direct asset URLs work in browser/portal.
      // Set MINIO_PUBLIC_READ=false to keep objects private.
      const allowPublicRead = isTrue(process.env.MINIO_PUBLIC_READ, true);
      if (allowPublicRead) {
        await client.setBucketPolicy(
          config.bucket,
          buildPublicReadPolicy(config.bucket),
        );
      }
    });
  } catch (error) {
    console.error("Failed to ensure MinIO bucket:", error);
  }
}

// Initialize bucket on startup
ensureBucket();

export type UploadedFileUrls = {
  objectName: string;
  url: string;
  presignedUrl: string | null;
};

export async function uploadFileWithUrls(
  fileBuffer: Buffer,
  fileName: string,
  mimetype: string,
): Promise<UploadedFileUrls> {
  const objectName = `${Date.now()}-${fileName}`;
  let resolvedConfig = activeStorageConfig;

  try {
    const uploadResult = await withStorageFallback(
      "upload",
      async (client, config) => {
        await client.putObject(
          config.bucket,
          objectName,
          fileBuffer,
          fileBuffer.length,
          {
            "Content-Type": mimetype,
          },
        );
      },
    );
    resolvedConfig = uploadResult.config;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Storage upload failed. ${reason}`);
  }

  const url = buildPublicObjectUrl(resolvedConfig, objectName);
  const includePresignedUrl = isTrue(
    process.env.ASSET_INCLUDE_PRESIGNED_URL,
    true,
  );

  let presignedUrl: string | null = null;
  if (includePresignedUrl) {
    try {
      presignedUrl = await buildPresignedObjectUrl(resolvedConfig, objectName);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[storage] Could not generate presigned URL for ${objectName}. ${reason}`,
      );
    }
  }

  return {
    objectName,
    url,
    presignedUrl,
  };
}

export async function uploadFile(
  fileBuffer: Buffer,
  fileName: string,
  mimetype: string,
): Promise<string> {
  const uploaded = await uploadFileWithUrls(fileBuffer, fileName, mimetype);
  return uploaded.url;
}

export async function getFileStream(
  objectName: string,
): Promise<NodeJS.ReadableStream> {
  const streamResult = await withStorageFallback(
    "get object",
    async (client, config) => {
      return await client.getObject(config.bucket, objectName);
    },
  );
  return streamResult.result;
}
