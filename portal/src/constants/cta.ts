export const CTA_TYPE_OPTIONS = [
  { value: "open_app", label: "Open Default", needsValue: false },
  { value: "deep_link", label: "Deep Link", needsValue: true },
  { value: "open_url", label: "Open URL", needsValue: true },
  { value: "dismiss", label: "Dismiss", needsValue: false },
  { value: "none", label: "No CTA", needsValue: false },
] as const;

export const APP_DEFAULT_TAP_ACTION_OPTIONS = [
  { value: "open_url", label: "Open URL", needsValue: true },
  { value: "deep_link", label: "Deep Link", needsValue: true },
  { value: "dismiss", label: "Dismiss", needsValue: false },
  { value: "none", label: "No CTA", needsValue: false },
] as const;

export type CtaType = (typeof CTA_TYPE_OPTIONS)[number]["value"];
export type AppDefaultTapActionType =
  (typeof APP_DEFAULT_TAP_ACTION_OPTIONS)[number]["value"];

export const DEFAULT_CTA_TYPE: CtaType = "open_app";

export const DEFAULT_TAP_ACTION_TYPE: CtaType = "open_app";

export function getCtaValuePlaceholder(ctaType: CtaType): string {
  switch (ctaType) {
    case "open_url":
      return "https://example.com";
    case "deep_link":
      return "myapp://screen/detail";
    default:
      return "";
  }
}

export function ctaNeedsValue(ctaType: CtaType): boolean {
  const option = CTA_TYPE_OPTIONS.find((o) => o.value === ctaType);
  return option?.needsValue ?? false;
}

export function appDefaultTapActionNeedsValue(
  tapActionType: AppDefaultTapActionType,
): boolean {
  const option = APP_DEFAULT_TAP_ACTION_OPTIONS.find(
    (candidate) => candidate.value === tapActionType,
  );
  return option?.needsValue ?? false;
}

export function getDefaultCtaLabel(ctaType: CtaType): string {
  switch (ctaType) {
    case "open_app":
      return "Open";
    case "open_url":
      return "Open link";
    case "deep_link":
      return "Open screen";
    case "dismiss":
      return "Dismiss";
    default:
      return "";
  }
}
