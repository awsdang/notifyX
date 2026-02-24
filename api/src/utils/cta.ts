import { AppError } from "./response";

export interface OpenLinkAction {
  action: "open_link_primary" | "open_link_secondary";
  title: string;
  url: string;
}

interface NormalizeCtaInput {
  actionUrl?: string | null;
  actions?: unknown[] | null;
  data?: Record<string, string> | null;
  requireActionUrl?: boolean;
  maxActions?: number;
}

interface NormalizeCtaResult {
  actionUrl?: string;
  actions?: OpenLinkAction[];
  data: Record<string, string>;
}

const OPEN_LINK_ACTION_ALIASES = new Set([
  "open_url",
  "open_link",
  "open_link_primary",
  "open_link_secondary",
]);

function trimToOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assertHttpUrl(value: string, fieldName: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AppError(400, `${fieldName} must be a valid URL`, "INVALID_CTA");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError(
      400,
      `${fieldName} must use http or https`,
      "INVALID_CTA",
    );
  }
}

export function normalizeOpenLinkCta(
  input: NormalizeCtaInput,
): NormalizeCtaResult {
  const maxActions = input.maxActions ?? 2;
  const requireActionUrl = input.requireActionUrl ?? true;
  const rawActions = Array.isArray(input.actions) ? input.actions : [];

  if (rawActions.length > maxActions) {
    throw new AppError(
      400,
      `Only up to ${maxActions} CTA buttons are supported`,
      "INVALID_CTA",
    );
  }

  const normalizedActions: OpenLinkAction[] = [];

  for (const [index, raw] of rawActions.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new AppError(400, "CTA action must be an object", "INVALID_CTA");
    }

    const record = raw as Record<string, unknown>;
    const actionName = trimToOptional(record.action) || "open_url";
    if (!OPEN_LINK_ACTION_ALIASES.has(actionName)) {
      throw new AppError(
        400,
        "Only open-link CTA buttons are supported",
        "INVALID_CTA",
      );
    }

    const title = trimToOptional(record.title);
    if (!title) {
      throw new AppError(400, "CTA button title is required", "INVALID_CTA");
    }

    const url = trimToOptional(record.url);
    if (!url) {
      throw new AppError(400, "CTA button URL is required", "INVALID_CTA");
    }
    assertHttpUrl(url, "CTA button URL");

    normalizedActions.push({
      action: index === 0 ? "open_link_primary" : "open_link_secondary",
      title,
      url,
    });
  }

  const explicitActionUrl = trimToOptional(input.actionUrl);
  const resolvedActionUrl = explicitActionUrl || normalizedActions[0]?.url;

  if (requireActionUrl && !resolvedActionUrl) {
    throw new AppError(
      400,
      "Default action URL is required",
      "INVALID_CTA",
    );
  }

  if (resolvedActionUrl) {
    assertHttpUrl(resolvedActionUrl, "Default action URL");
  }

  const normalizedData: Record<string, string> = {
    ...(input.data || {}),
  };

  if (resolvedActionUrl) {
    normalizedData.actionUrl = resolvedActionUrl;
  }

  if (normalizedActions.length > 0) {
    normalizedData.actions = JSON.stringify(normalizedActions);
  }

  for (const action of normalizedActions) {
    normalizedData[`actionUrl_${action.action}`] = action.url;
  }

  return {
    actionUrl: resolvedActionUrl,
    actions: normalizedActions.length > 0 ? normalizedActions : undefined,
    data: normalizedData,
  };
}
