import {
  ctaNeedsValue,
  getDefaultCtaLabel,
  type CtaType,
} from "../constants/cta";

export interface CtaButtonDraft {
  type: CtaType;
  label: string;
  value: string;
  dataSuffix: "" | "Secondary";
}

export interface BuildNotificationCtaPayloadInput {
  tapActionType: CtaType;
  tapActionValue: string;
  ctas: CtaButtonDraft[];
}

export interface BuildNotificationCtaPayloadResult {
  tapActionType: CtaType;
  actionUrl?: string;
  data?: Record<string, string>;
  actions?: Array<{ action: string; title: string; url?: string }>;
}

export function buildNotificationCtaPayload(
  input: BuildNotificationCtaPayloadInput,
): BuildNotificationCtaPayloadResult {
  const tapActionValue = input.tapActionValue.trim();

  if (input.tapActionType === "open_url" && !tapActionValue) {
    throw new Error("URL is required when tap action is Open URL.");
  }

  if (input.tapActionType === "deep_link" && !tapActionValue) {
    throw new Error("Deep link URI is required when tap action is Deep Link.");
  }

  const ctaData: Record<string, string> = {
    tapActionType: input.tapActionType,
  };

  if (tapActionValue) {
    ctaData.tapActionValue = tapActionValue;
  }

  const actions = input.ctas
    .filter((cta) => cta.type !== "none")
    .map((cta, index) => {
      const label = cta.label.trim() || getDefaultCtaLabel(cta.type);
      const value = cta.value.trim();

      if (!label) {
        throw new Error("CTA label is required when a CTA is enabled.");
      }

      if (ctaNeedsValue(cta.type) && !value) {
        throw new Error("CTA URL or deep link is required when a CTA is enabled.");
      }

      ctaData[`ctaType${cta.dataSuffix}`] = cta.type;
      ctaData[`ctaLabel${cta.dataSuffix}`] = label;
      if (value) {
        ctaData[`ctaValue${cta.dataSuffix}`] = value;
      }

      return {
        action:
          cta.type === "open_url"
            ? index === 0
              ? "open_link_primary"
              : "open_link_secondary"
            : cta.type,
        title: label,
        ...(value ? { url: value } : {}),
      };
    });

  return {
    tapActionType: input.tapActionType,
    actionUrl: tapActionValue || undefined,
    data: Object.keys(ctaData).length > 0 ? ctaData : undefined,
    actions: actions.length > 0 ? actions : undefined,
  };
}