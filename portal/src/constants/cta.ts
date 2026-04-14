export const CTA_TYPE_OPTIONS = [
  { value: "open_app", label: "Open App (Default)", needsValue: false },
  { value: "deep_link", label: "Deep Link", needsValue: true },
  { value: "open_url", label: "Open URL", needsValue: true },
  { value: "dismiss", label: "Dismiss", needsValue: false },
  { value: "none", label: "No Action", needsValue: false },
] as const;

export type CtaType = (typeof CTA_TYPE_OPTIONS)[number]["value"];

export const DEFAULT_CTA_TYPE: CtaType = "open_app";

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
