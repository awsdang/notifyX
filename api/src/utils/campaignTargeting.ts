import { Prisma } from "@prisma/client";

export type CampaignPlatform = "android" | "ios" | "huawei" | "web";

type CampaignAction = Record<string, unknown>;

export interface CampaignTargetingData {
  userIds: string[];
  platforms?: CampaignPlatform[];
  actionUrl?: string;
  data?: Record<string, string>;
  actions?: CampaignAction[];
}

interface BuildCampaignTargetingInput {
  userIds?: string[] | null;
  platforms?: string[] | null;
  actionUrl?: string | null;
  data?: Record<string, string> | null;
  actions?: unknown[] | null;
}

const ALLOWED_PLATFORMS = new Set<CampaignPlatform>([
  "android",
  "ios",
  "huawei",
  "web",
]);

const normalizeUserIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed) unique.add(trimmed);
  }
  return Array.from(unique);
};

const normalizePlatforms = (value: unknown): CampaignPlatform[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const unique = new Set<CampaignPlatform>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.toLowerCase();
    if (ALLOWED_PLATFORMS.has(normalized as CampaignPlatform)) {
      unique.add(normalized as CampaignPlatform);
    }
  }
  return unique.size > 0 ? Array.from(unique) : undefined;
};

const normalizeData = (
  value: unknown,
): Record<string, string> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") continue;
    output[key] = raw;
  }
  return Object.keys(output).length > 0 ? output : undefined;
};

const normalizeActions = (value: unknown): CampaignAction[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const actions = value.filter(
    (action): action is CampaignAction =>
      Boolean(action) && typeof action === "object" && !Array.isArray(action),
  );
  return actions.length > 0 ? actions : undefined;
};

const toJsonObject = (value: unknown): Prisma.InputJsonObject | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    if (
      normalized &&
      typeof normalized === "object" &&
      !Array.isArray(normalized)
    ) {
      return normalized as Prisma.InputJsonObject;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const normalizeActionsForStorage = (
  value: unknown,
): Prisma.InputJsonObject[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const actions = value
    .map((action) => toJsonObject(action))
    .filter((action): action is Prisma.InputJsonObject => Boolean(action));
  return actions.length > 0 ? actions : undefined;
};

export function parseCampaignTargetingData(
  raw: unknown,
): CampaignTargetingData {
  if (Array.isArray(raw)) {
    return { userIds: normalizeUserIds(raw) };
  }

  if (!raw || typeof raw !== "object") {
    return { userIds: [] };
  }

  const record = raw as Record<string, unknown>;
  return {
    userIds: normalizeUserIds(record.userIds),
    platforms: normalizePlatforms(record.platforms),
    actionUrl:
      typeof record.actionUrl === "string" && record.actionUrl.trim()
        ? record.actionUrl.trim()
        : undefined,
    data: normalizeData(record.data),
    actions: normalizeActions(record.actions),
  };
}

export function buildCampaignTargetingData(
  input: BuildCampaignTargetingInput,
): Prisma.InputJsonValue | undefined {
  const userIds = normalizeUserIds(input.userIds ?? []);
  const platforms = normalizePlatforms(input.platforms);
  const actionUrl = input.actionUrl?.trim();
  const data = normalizeData(input.data);
  const actions = normalizeActionsForStorage(input.actions);

  const hasMetadata = Boolean(
    platforms ||
      (actionUrl && actionUrl.length > 0) ||
      data ||
      (actions && actions.length > 0),
  );

  if (!hasMetadata) {
    return userIds.length > 0 ? userIds : undefined;
  }

  return {
    userIds,
    ...(platforms ? { platforms } : {}),
    ...(actionUrl ? { actionUrl } : {}),
    ...(data ? { data } : {}),
    ...(actions ? { actions } : {}),
  } as Prisma.InputJsonObject;
}
