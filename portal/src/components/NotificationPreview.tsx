import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../helpers/utils";
import iphoneFrame from "../assets/device-frames/iphone-frame.png";
import pixelFrame from "../assets/device-frames/pixel-9-pro-xl-frame.svg";
import huaweiFrame from "../assets/device-frames/huawei-frame.png";
import { useScopedTranslation } from "../context/I18nContext";

interface NotificationPreviewProps {
  platform: "android" | "ios" | "huawei" | "web";
  title: string;
  subtitle?: string;
  body: string;
  image?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctaActions?: Array<{ label: string; value?: string }>;
  direction?: "ltr" | "rtl";
  selectedPlatforms?: Array<"ios" | "android" | "huawei">;
}

type MobilePlatform = "android" | "ios" | "huawei";

interface FrameConfig {
  asset: string;
  screen: {
    left: number;
    top: number;
    width: number;
    height: number;
    radius: number;
  };
}

const FRAME_CONFIG: Record<MobilePlatform, FrameConfig> = {
  ios: {
    asset: iphoneFrame,
    screen: { left: 4.05, top: 7.2, width: 92.45, height: 88.3, radius: 7.2 },
  },
  android: {
    asset: pixelFrame,
    screen: { left: 4.05, top: 7.6, width: 91.45, height: 66.3, radius: 0 },
  },
  huawei: {
    asset: huaweiFrame,
    screen: { left: 4.05, top: 6.65, width: 91.45, height: 88, radius: 5.4 },
  },
};

function AppIcon() {
  return (
    <div className="w-5 h-5 rounded-[5px] bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
      NX
    </div>
  );
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}...`;
}

export function NotificationPreview({
  platform,
  title,
  subtitle,
  body,
  image,
  ctaLabel,
  ctaUrl,
  ctaActions,
  direction = "ltr",
  selectedPlatforms: _selectedPlatforms = ["ios", "android", "huawei"],
}: NotificationPreviewProps) {
  const tp = useScopedTranslation("components", "NotificationPreview");
  const tt = useCallback(
    (
      key: string,
      params?: Record<string, string | number>,
      fallback?: string,
    ) => tp(key, fallback || key, params),
    [tp],
  );
  const isRTL = direction === "rtl";
  const [isExpanded, setIsExpanded] = useState(false);
  const [iosActionsOpen, setIosActionsOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const isIos = platform === "ios";
  const isAndroidFamily = platform === "android" || platform === "huawei";

  const actions = useMemo(() => {
    if (ctaActions && ctaActions.length > 0) {
      return ctaActions
        .map((action) => ({
          label: action.label.trim(),
          value: action.value?.trim(),
        }))
        .filter((action) => action.label)
        .slice(0, 2);
    }

    const fallbackActions: Array<{ label: string; value?: string }> = [];
    if (ctaLabel?.trim()) {
      fallbackActions.push({ label: ctaLabel.trim(), value: ctaUrl?.trim() });
    }

    if (ctaUrl?.trim()) {
      try {
        const host = new URL(ctaUrl).hostname.replace(/^www\./, "");
        if (!ctaLabel?.trim()) {
          fallbackActions.push({
            label: host || tt("Open Link"),
            value: ctaUrl.trim(),
          });
        }
      } catch {
        if (!ctaLabel?.trim()) {
          fallbackActions.push({ label: tt("Open Link"), value: ctaUrl.trim() });
        }
      }
    }

    return fallbackActions.slice(0, 2);
  }, [ctaActions, ctaLabel, ctaUrl, tt]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setIsExpanded(false);
      setIosActionsOpen(false);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [platform]);

  useEffect(() => {
    if (!isIos || actions.length === 0) {
      const closeTimer = window.setTimeout(() => {
        setIosActionsOpen(false);
      }, 0);
      return () => window.clearTimeout(closeTimer);
    }

    // Show CTA group briefly when CTAs exist, then close and wait for long press.
    const openTimer = window.setTimeout(() => {
      setIosActionsOpen(true);
    }, 0);
    const closeTimer = window.setTimeout(() => {
      setIosActionsOpen(false);
    }, 1200);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
  }, [isIos, actions]);

  if (platform === "web") {
    return (
      <div
        className="w-88 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
        dir={direction}
      >
        <div className="h-9 bg-slate-100 border-b border-slate-200 flex items-center px-3 gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ms-auto text-[10px] font-bold text-slate-400 tracking-wider">
            {tt("WEB PUSH")}
          </span>
        </div>

        <div className={cn("p-4", isRTL && "text-end")}>
          <p className="text-[10px] font-bold text-slate-400 mb-1">
            {tt("NOTIFYX • now")}
          </p>
          <h4 className="font-semibold text-slate-900 text-sm">{title}</h4>
          {subtitle ? (
            <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>
          ) : null}
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">{body}</p>

          {image ? (
            <div className="mt-3 rounded-lg overflow-hidden border border-slate-200">
              <img
                src={image}
                alt="Notification visual"
                className="w-full h-28 object-cover"
              />
            </div>
          ) : null}

          {actions.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {actions.map((action, index) => (
                <button
                  key={`web-action-${action.label}-${index}`}
                  className={cn(
                    "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[11px] font-semibold",
                    index === 0
                      ? "bg-indigo-600 text-white"
                      : "border border-indigo-200 bg-indigo-50 text-indigo-700",
                  )}
                >
                  {truncateText(action.label, 20)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const mobilePlatform = platform as MobilePlatform;
  const frame = FRAME_CONFIG[mobilePlatform];
  const platformLabel =
    platform === "ios"
      ? tt("Apple Push")
      : platform === "android"
        ? tt("Android Push")
        : tt("Huawei Push");

  const previewTitle = truncateText(title, 25);
  const previewBody = truncateText(body, isExpanded ? 150 : 60);
  const previewSubtitle = subtitle ? truncateText(subtitle, 25) : null;

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    if (!isIos || actions.length === 0) return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      setIosActionsOpen(true);
      setIsExpanded(true);
      suppressClickRef.current = true;
    }, 420);
  };

  const endLongPress = () => {
    clearLongPressTimer();
  };

  return (
    <div className="w-[22rem] max-w-full" dir={direction}>
      <div className="relative h-[750px]">
        <img
          src={frame.asset}
          alt={`${platformLabel} device frame`}
          className="absolute object-cover h-full w-full select-none"
          draggable={false}
          loading="lazy"
        />

        <div
          className="absolute"
          style={{
            left: `${frame.screen.left}%`,
            top: `${frame.screen.top}%`,
            width: `${frame.screen.width}%`,
            height: `${frame.screen.height}%`,
          }}
        >
          <div
            className="h-full w-full overflow-hidden bg-slate-100 p-3"
            style={{ borderRadius: `${frame.screen.radius}%` }}
          >
            <div className="space-y-2">
              <div
                className={cn(
                  "shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
                  isIos
                    ? "rounded-[20px] px-[14px] py-3 bg-[rgba(245,245,245,0.75)] border border-white/30 backdrop-blur-[24px]"
                    : "rounded-[28px] px-4 py-3 bg-[#fafafa] border border-black/10",
                  isRTL && "text-end",
                )}
                onMouseDown={startLongPress}
                onMouseUp={endLongPress}
                onMouseLeave={endLongPress}
                onTouchStart={startLongPress}
                onTouchEnd={endLongPress}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  setIsExpanded((prev) => !prev);
                  if (isIos && iosActionsOpen) setIosActionsOpen(false);
                }}
              >
                <div
                  className={cn(
                    "flex items-center justify-between mb-2",
                    isRTL && "flex-row-reverse",
                  )}
                >
                  <div className={cn("flex items-center gap-2", isRTL && "flex-row-reverse")}>
                    <AppIcon />
                    <span
                      className={cn(
                        "font-semibold",
                        isIos
                          ? "text-[12px] uppercase text-black/65"
                          : "text-[13px] text-[#49454f]",
                      )}
                    >
                      NotifyX
                    </span>
                    {isAndroidFamily ? <span className="text-[#49454f]/70 text-[13px]">•</span> : null}
                    {isAndroidFamily ? (
                      <span className="text-[12px] text-[#49454f]">now</span>
                    ) : null}
                  </div>
                  <span className={cn(isIos ? "text-[12px] text-black/45" : "text-[16px] text-[#555]")}>
                    {isIos ? "now" : isExpanded ? "⌄" : "›"}
                  </span>
                </div>

                <p
                  className={cn(
                    "font-semibold",
                    isIos ? "text-[15px] text-black" : "text-[16px] text-[#1d1b20]",
                    !isExpanded && "line-clamp-1",
                  )}
                >
                  {previewTitle}
                </p>

                {previewSubtitle ? (
                  <p
                    className={cn(
                      "mt-0.5",
                      isIos ? "text-[13px] text-black/70" : "text-[13px] text-[#49454f]",
                      !isExpanded && "line-clamp-1",
                    )}
                  >
                    {previewSubtitle}
                  </p>
                ) : null}

                <p
                  className={cn(
                    "leading-[1.35] mt-0.5",
                    isIos ? "text-[15px] text-black/85" : "text-[14px] text-[#49454f]",
                    !isExpanded && "line-clamp-1",
                  )}
                >
                  {previewBody}
                </p>

                {image && isExpanded ? (
                  <div className="mt-2 rounded-lg overflow-hidden border border-black/10">
                    <img src={image} alt="Notification visual" className="w-full h-20 object-cover" />
                  </div>
                ) : null}

                {isAndroidFamily && actions.length > 0 && isExpanded ? (
                  <div className="mt-3 pt-1 flex items-center gap-2">
                    {actions.map((action, index) => (
                      <button
                        key={`${action.label}-${index}`}
                        className={cn(
                          "text-[13px] rounded-full px-3 py-1.5",
                          index === 0
                            ? "bg-[#6750a4] text-white"
                            : "bg-transparent text-[#6750a4]",
                        )}
                      >
                        {truncateText(action.label, 18)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {isIos && actions.length > 0 && iosActionsOpen ? (
                <div className="mx-2 bg-[rgba(245,245,245,0.75)] border border-white/30 backdrop-blur-[24px] rounded-[14px] overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                  {actions.map((action, index) => (
                    <button
                      key={`ios-action-${action.label}-${index}`}
                      className={cn(
                        "w-full px-3 py-3 text-start text-[15px] text-[#007aff]",
                        index === 0 && actions.length > 1 && "border-b border-black/10",
                      )}
                    >
                      {truncateText(action.label, 24)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
