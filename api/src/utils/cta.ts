import { AppError } from "./response";

export type CtaActionType =
  | "open_link_primary"
  | "open_link_secondary"
  | "open_app"
  | "deep_link"
  | "dismiss";

export type TapActionType =
  | "open_app"
  | "open_url"
  | "deep_link"
  | "dismiss"
  | "none";

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
  tapActionType?: string | null;
  defaultTapActionType?: string | null;
  defaultTapActionValue?: string | null;
  requireActionUrl?: boolean;
  maxActions?: number;
}

interface NormalizeCtaResult {
  actionUrl?: string;
  actions?: CtaAction[];
  data: Record<string, string>;
  tapActionType: TapActionType;
}

const OPEN_LINK_ACTION_ALIASES = new Set([
  "open_url",
  "open_link",
  "open_link_primary",
  "open_link_secondary",
]);
const TAP_ACTION_TYPES = new Set([
  "open_app",
  "open_url",
  "deep_link",
  "dismiss",
  "none",
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

function inferTapActionType(actionUrl: string): TapActionType {
  try {
    const parsed = new URL(actionUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return "open_url";
    }
    return "deep_link";
  } catch {
    return actionUrl.startsWith("/") ? "deep_link" : "open_url";
  }
}

function normalizeTapAction(
  input: NormalizeCtaInput,
): Pick<NormalizeCtaResult, "actionUrl" | "tapActionType"> {
  const explicitActionUrl = trimToOptional(input.actionUrl);
  const explicitTapActionType = trimToOptional(input.tapActionType);
  const defaultTapActionType = trimToOptional(input.defaultTapActionType);
  const defaultTapActionValue = trimToOptional(input.defaultTapActionValue);

  const requestedTapActionType =
    explicitTapActionType && TAP_ACTION_TYPES.has(explicitTapActionType)
      ? (explicitTapActionType as TapActionType)
      : explicitActionUrl
        ? inferTapActionType(explicitActionUrl)
        : "open_app";

  const effectiveTapActionType =
    requestedTapActionType === "open_app"
      ? defaultTapActionType && TAP_ACTION_TYPES.has(defaultTapActionType)
        ? (defaultTapActionType as TapActionType)
        : "none"
      : requestedTapActionType;

  if (effectiveTapActionType === "open_url") {
    const resolvedActionUrl =
      requestedTapActionType === "open_app"
        ? defaultTapActionValue
        : explicitActionUrl;

    if (!resolvedActionUrl) {
      throw new AppError(400, "Tap action URL is required", "INVALID_CTA");
    }

    assertHttpUrl(resolvedActionUrl, "Tap action URL");

    return {
      actionUrl: resolvedActionUrl,
      tapActionType: effectiveTapActionType,
    };
  }

  if (effectiveTapActionType === "deep_link") {
    const resolvedActionUrl =
      requestedTapActionType === "open_app"
        ? defaultTapActionValue
        : explicitActionUrl;

    if (!resolvedActionUrl) {
      throw new AppError(400, "Tap action URI is required", "INVALID_CTA");
    }

    assertUri(resolvedActionUrl, "Tap action URI");

    return {
      actionUrl: resolvedActionUrl,
      tapActionType: effectiveTapActionType,
    };
  }

  return {
    actionUrl: undefined,
    tapActionType: effectiveTapActionType,
  };
}

export function normalizeOpenLinkCta(
  input: NormalizeCtaInput,
): NormalizeCtaResult {
  const maxActions = input.maxActions ?? 2;
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

  const normalizedTapAction = normalizeTapAction(input);

  const normalizedData: Record<string, string> = {
    ...(input.data || {}),
  };

  normalizedData.tapActionType = normalizedTapAction.tapActionType;

  if (normalizedTapAction.actionUrl) {
    normalizedData.actionUrl = normalizedTapAction.actionUrl;
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
    actionUrl: normalizedTapAction.actionUrl,
    actions: normalizedActions.length > 0 ? normalizedActions : undefined,
    data: normalizedData,
    tapActionType: normalizedTapAction.tapActionType,
  };
}
