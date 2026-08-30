import { clsx } from "clsx";
import { Bell } from "lucide-react";
import { AppleIcon, FirebaseIcon, HuaweiIcon, WebPushIcon } from "../ui/BrandIcons";

export type PreviewPlatform = "ios" | "android" | "huawei" | "web";

export interface PreviewPayload {
  title: string;
  body: string;
  image?: string;
  appName: string;
  iconUrl?: string | null;
  actionLabel?: string | null;
}

export const PREVIEW_PLATFORMS: {
  id: PreviewPlatform;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "ios", label: "iOS", icon: <AppleIcon size={15} /> },
  { id: "android", label: "Android", icon: <FirebaseIcon size={15} /> },
  { id: "huawei", label: "Huawei", icon: <HuaweiIcon size={15} /> },
  { id: "web", label: "Web", icon: <WebPushIcon size={15} /> },
];

function AppGlyph({
  payload,
  rounded,
  size = "h-8 w-8",
}: {
  payload: PreviewPayload;
  rounded: string;
  size?: string;
}) {
  if (payload.iconUrl) {
    return (
      <img
        src={payload.iconUrl}
        alt=""
        className={clsx(size, rounded, "shrink-0 object-cover")}
      />
    );
  }
  return (
    <div
      className={clsx(
        size,
        rounded,
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600",
      )}
    >
      <Bell size={14} className="text-white" />
    </div>
  );
}

/**
 * Approximates how each platform renders a banner. Not pixel-exact — it exists
 * so copy length, image crop and truncation problems are visible before a send,
 * which is where most "why does it look wrong on Android" issues come from.
 */
export function DevicePreview({
  platform,
  payload,
}: {
  platform: PreviewPlatform;
  payload: PreviewPayload;
}) {
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (platform === "web") {
    return (
      <div className="mx-auto w-full max-w-[340px]">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl">
          <div className="flex gap-3">
            <AppGlyph payload={payload} rounded="rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {payload.title || "Notification title"}
              </p>
              <p className="mt-0.5 line-clamp-3 text-[13px] leading-snug text-slate-600">
                {payload.body || "Body copy shows up here."}
              </p>
              <p className="mt-1.5 truncate text-[11px] text-slate-400">
                {payload.appName || "NotifyX"}
              </p>
            </div>
          </div>
          {payload.image && (
            <img
              src={payload.image}
              alt=""
              className="mt-3 h-32 w-full rounded-lg object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Chrome / Edge desktop banner
        </p>
      </div>
    );
  }

  const isIOS = platform === "ios";

  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div
        className={clsx(
          "overflow-hidden border-[6px] bg-slate-950",
          isIOS ? "rounded-[38px] border-slate-800" : "rounded-[26px] border-slate-700",
        )}
      >
        <div className="flex items-center justify-between bg-slate-950 px-5 py-2">
          <span className="text-[11px] font-semibold text-white">{time}</span>
          <div className="h-2.5 w-4 rounded-sm border border-white/60 p-px">
            <div className="h-full w-3/4 rounded-sm bg-white/80" />
          </div>
        </div>

        <div className="min-h-[380px] bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 p-2.5">
          {isIOS ? (
            <div className="rounded-2xl border border-white/20 bg-white/90 p-3 shadow-lg backdrop-blur">
              <div className="flex gap-2.5">
                <AppGlyph payload={payload} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {payload.appName || "NotifyX"}
                    </p>
                    <span className="shrink-0 text-[10px] text-slate-400">now</span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] font-bold text-slate-900">
                    {payload.title || "Notification title"}
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-slate-700">
                    {payload.body || "Body copy shows up here."}
                  </p>
                </div>
              </div>
              {payload.image && (
                <img
                  src={payload.image}
                  alt=""
                  className="mt-2 h-24 w-full rounded-lg object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                />
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-white p-3 shadow-lg">
              <div className="mb-1.5 flex items-center gap-1.5">
                <AppGlyph payload={payload} rounded="rounded-full" size="h-4 w-4" />
                <span className="truncate text-[11px] font-medium text-slate-600">
                  {payload.appName || "NotifyX"}
                </span>
                <span className="text-[11px] text-slate-400">· now</span>
              </div>
              <p className="truncate text-[13px] font-bold text-slate-900">
                {payload.title || "Notification title"}
              </p>
              <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-slate-600">
                {payload.body || "Body copy shows up here."}
              </p>
              {payload.image && (
                <img
                  src={payload.image}
                  alt=""
                  className="mt-2 h-24 w-full rounded-lg object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                />
              )}
              {payload.actionLabel && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <span className="text-[12px] font-bold uppercase tracking-wide text-blue-600">
                    {payload.actionLabel}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {isIOS && (
          <div className="flex justify-center bg-slate-950 pb-2 pt-1">
            <div className="h-1 w-24 rounded-full bg-white/30" />
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        {platform === "huawei"
          ? "Huawei EMUI banner (HMS)"
          : isIOS
            ? "iOS lock-screen banner"
            : "Android heads-up notification"}
      </p>
    </div>
  );
}
