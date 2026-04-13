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
      if (exists) {
        return;
      }

      await client.makeBucket(config.bucket, "us-east-1"); // Region is required but often ignored for local

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
      await client.setBucketPolicy(config.bucket, JSON.stringify(policy));
    });
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

  // Return public URL (override host for real devices if provided)
  const publicBase = process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (publicBase) {
    return `${publicBase}/${resolvedConfig.bucket}/${objectName}`;
  }

  const protocol = resolvedConfig.useSSL ? "https" : "http";
  return `${protocol}://${resolvedConfig.endPoint}:${resolvedConfig.port}/${resolvedConfig.bucket}/${objectName}`;
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
