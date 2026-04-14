import { AppError } from "./response";

export type CtaActionType =
  | "open_link_primary"
  | "open_link_secondary"
  | "open_app"
  | "deep_link"
  | "dismiss";

export interface CtaAction {
  action: CtaActionType;
  title: string;
  url?: string;
}

// Keep backward compat export
export type OpenLinkAction = CtaAction;

interface NormalizeCtaInput {
  actionUrl?: string | null;
  actions?: unknown[] | null;
  data?: Record<string, string> | null;
  requireActionUrl?: boolean;
  maxActions?: number;
}

interface NormalizeCtaResult {
  actionUrl?: string;
  actions?: CtaAction[];
  data: Record<string, string>;
}

const OPEN_LINK_ACTION_ALIASES = new Set([
  "open_url",
  "open_link",
  "open_link_primary",
  "open_link_secondary",
]);

const NO_URL_ACTIONS = new Set(["open_app", "dismiss"]);
const DEEP_LINK_ACTIONS = new Set(["deep_link"]);

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

function assertUri(value: string, fieldName: string): void {
  try {
    new URL(value);
  } catch {
    // Allow relative deep link paths like /screen/detail
    if (value.startsWith("/")) return;
    throw new AppError(400, `${fieldName} must be a valid URI`, "INVALID_CTA");
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

  const normalizedActions: CtaAction[] = [];

  for (const [index, raw] of rawActions.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new AppError(400, "CTA action must be an object", "INVALID_CTA");
    }

    const record = raw as Record<string, unknown>;
    const actionName = trimToOptional(record.action) || "open_url";

    // Handle no-URL actions (open_app, dismiss)
    if (NO_URL_ACTIONS.has(actionName)) {
      const title = trimToOptional(record.title) || actionName;
      normalizedActions.push({
        action: actionName as CtaActionType,
        title,
      });
      continue;
    }

    // Handle deep_link actions
    if (DEEP_LINK_ACTIONS.has(actionName)) {
      const title = trimToOptional(record.title);
      if (!title) {
        throw new AppError(400, "CTA button title is required", "INVALID_CTA");
      }
      const url = trimToOptional(record.url);
      if (!url) {
        throw new AppError(400, "Deep link URI is required", "INVALID_CTA");
      }
      assertUri(url, "Deep link URI");
      normalizedActions.push({
        action: "deep_link",
        title,
        url,
      });
      continue;
    }

    // Handle open_link actions (backward compat)
    if (!OPEN_LINK_ACTION_ALIASES.has(actionName)) {
      throw new AppError(
        400,
        `Unsupported CTA action type: ${actionName}`,
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
  const firstLinkAction = normalizedActions.find((a) => a.url && OPEN_LINK_ACTION_ALIASES.has(a.action));
  const resolvedActionUrl = explicitActionUrl || firstLinkAction?.url;

  // Only require actionUrl if there are no open_app/dismiss/deep_link actions
  const hasNonLinkAction = normalizedActions.some(
    (a) => NO_URL_ACTIONS.has(a.action) || DEEP_LINK_ACTIONS.has(a.action),
  );
  if (requireActionUrl && !resolvedActionUrl && !hasNonLinkAction) {
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
    if (action.url) {
      normalizedData[`actionUrl_${action.action}`] = action.url;
    }
  }

  return {
    actionUrl: resolvedActionUrl,
    actions: normalizedActions.length > 0 ? normalizedActions : undefined,
    data: normalizedData,
  };
}
