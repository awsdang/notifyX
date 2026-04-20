import { useState } from "react";
import {
  Terminal,
  Send,
  Code2,
  Copy,
  CheckCircle2,
  Loader2,
  Clock,
  Smartphone,
  Monitor,
  Bell,
  Image,
  Type,
  MessageSquare,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { clsx } from "clsx";

/* ─── Types ─── */

type Platform = "ios" | "android" | "web";
type SimTab = "notification" | "webhook";

interface NotificationPayload {
  title: string;
  body: string;
  imageUrl: string;
  badge: string;
  actionUrl: string;
  platform: Platform;
}

interface SimulationRun {
  id: string;
  timestamp: Date;
  status: number;
  url: string;
  event: string;
}

/* ─── Webhook Event Templates ─── */

const EVENT_TEMPLATES = [
  {
    id: "notification.sent",
    label: "Sent",
    payload: {
      event: "notification.sent",
      notificationId: "notif_78210",
      recipient: "user_123",
      provider: "fcm",
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "notification.delivered",
    label: "Delivered",
    payload: {
      event: "notification.delivered",
      notificationId: "notif_78210",
      recipient: "user_123",
      platform: "android",
      timestamp: new Date().toISOString(),
    },
  },
  {
    id: "notification.failed",
    label: "Failed",
    payload: {
      event: "notification.failed",
      notificationId: "notif_78210",
      error: "TOKEN_INVALID",
      details: "The FCM registration token has expired.",
      timestamp: new Date().toISOString(),
    },
  },
];

/* ─── Platform Config ─── */

const PLATFORMS: {
  id: Platform;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "ios", label: "iOS", icon: <Smartphone size={16} /> },
  { id: "android", label: "Android", icon: <Smartphone size={16} /> },
  { id: "web", label: "Web", icon: <Monitor size={16} /> },
];

/* ─── Device Mockup: Notification Preview ─── */

function DevicePreview({
  payload,
}: {
  payload: NotificationPayload;
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (payload.platform === "web") {
    return (
      <div className="mx-auto w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <Bell size={18} className="text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  NotifyX
                </p>
                <p className="text-[10px] text-slate-400">{timeStr}</p>
              </div>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                {payload.title || "Notification Title"}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                {payload.body || "Notification body text will appear here..."}
              </p>
            </div>
          </div>
          {payload.imageUrl && (
            <div className="mt-3 h-32 w-full overflow-hidden rounded-lg bg-slate-100">
              <img
                src={payload.imageUrl}
                alt="Preview"
                className="h-full w-full object-cover"
                onError={(e) =>
                  ((e.target as HTMLImageElement).style.display = "none")
                }
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // iOS / Android device frame
  const isIOS = payload.platform === "ios";

  return (
    <div className="mx-auto w-full max-w-[280px]">
      {/* Device frame */}
      <div
        className={clsx(
          "overflow-hidden border-[6px] bg-slate-950",
          isIOS
            ? "rounded-[36px] border-slate-800"
            : "rounded-[24px] border-slate-700",
        )}
      >
        {/* Status bar */}
        <div className="flex items-center justify-between bg-slate-950 px-6 py-2">
          <span className="text-[11px] font-semibold text-white">
            {timeStr}
          </span>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-4 rounded-sm border border-white/60 p-px">
              <div className="h-full w-3/4 rounded-sm bg-white/80" />
            </div>
          </div>
        </div>

        {/* Notification card */}
        <div className="min-h-[400px] bg-gradient-to-b from-slate-800 to-slate-900 p-3">
          <div
            className={clsx(
              "border bg-white/95 p-3 shadow-lg backdrop-blur",
              isIOS ? "rounded-2xl border-white/20" : "rounded-xl border-white/10",
            )}
          >
            <div className="flex gap-2.5">
              <div
                className={clsx(
                  "flex h-8 w-8 shrink-0 items-center justify-center bg-blue-600",
                  isIOS ? "rounded-lg" : "rounded-full",
                )}
              >
                <Bell size={14} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    NotifyX
                  </p>
                  <p className="text-[10px] text-slate-400">{timeStr}</p>
                </div>
                <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
                  {payload.title || "Notification Title"}
                </p>
                <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-slate-600">
                  {payload.body ||
                    "Notification body text will appear here..."}
                </p>
              </div>
            </div>
            {payload.imageUrl && (
              <div className="mt-2 h-28 w-full overflow-hidden rounded-lg bg-slate-100">
                <img
                  src={payload.imageUrl}
                  alt="Preview"
                  className="h-full w-full object-cover"
                  onError={(e) =>
                    ((e.target as HTMLImageElement).style.display = "none")
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Home indicator */}
        {isIOS && (
          <div className="flex justify-center bg-slate-950 pb-2 pt-1">
            <div className="h-1 w-24 rounded-full bg-white/30" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export function WebhookSimulator() {
  const [activeTab, setActiveTab] = useState<SimTab>("notification");

  // Notification tester state
  const [notifPayload, setNotifPayload] = useState<NotificationPayload>({
    title: "Welcome to NotifyX!",
    body: "Your push notification integration is ready. Start engaging your users with real-time notifications.",
    imageUrl: "",
    badge: "1",
    actionUrl: "",
    platform: "ios",
  });

  // Webhook tester state
  const [targetUrl, setTargetUrl] = useState(
    "https://api.yourdomain.com/webhooks/notifyx",
  );
  const [selectedTemplate, setSelectedTemplate] = useState(EVENT_TEMPLATES[0]);
  const [payload, setPayload] = useState(
    JSON.stringify(EVENT_TEMPLATES[0].payload, null, 2),
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [runs, setRuns] = useState<SimulationRun[]>([]);

  const handleTemplateChange = (id: string) => {
    const template = EVENT_TEMPLATES.find((t) => t.id === id)!;
    setSelectedTemplate(template);
    setPayload(JSON.stringify(template.payload, null, 2));
  };

  const runSimulation = async () => {
    setIsSimulating(true);
    setLastResponse(null);

    try {
      let parsedPayload: Record<string, unknown>;
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        throw new Error("Payload must be valid JSON");
      }

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-NotifyX-Simulator": "true",
        },
        body: JSON.stringify(parsedPayload),
      });

      const rawBody = await response.text();
      let body: any = rawBody;
      try {
        body = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        /* keep text */
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (
          key === "content-type" ||
          key === "x-request-id" ||
          key === "server" ||
          key.startsWith("x-")
        ) {
          headers[key] = value;
        }
      });

      setLastResponse({
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      });

      setRuns((prev) => [
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          status: response.status,
          url: targetUrl,
          event: selectedTemplate.id,
        },
        ...prev.slice(0, 9),
      ]);
    } catch (error: any) {
      setLastResponse({
        status: 0,
        statusText: "NETWORK_ERROR",
        headers: { "content-type": "text/plain" },
        body: {
          success: false,
          error: error?.message || "Failed to send webhook request",
        },
      });
      setRuns((prev) => [
        {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          status: 0,
          url: targetUrl,
          event: selectedTemplate.id,
        },
        ...prev.slice(0, 9),
      ]);
    } finally {
      setIsSimulating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
      {/* Header + Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Zap className="h-5 w-5 text-indigo-600" />
            Notification Simulator
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Preview notifications and test webhook integrations
          </p>
        </div>
        <div className="inline-flex rounded-xl border bg-white p-1">
          <button
            onClick={() => setActiveTab("notification")}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              activeTab === "notification"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Push Preview
          </button>
          <button
            onClick={() => setActiveTab("webhook")}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              activeTab === "webhook"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Webhook Tester
          </button>
        </div>
      </div>

      {/* ── Notification Preview Tab ── */}
      {activeTab === "notification" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Form side */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
                <MessageSquare size={16} className="text-indigo-600" />
                Compose Notification
              </h3>

              {/* Platform selector */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Platform
                </label>
                <div className="flex gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() =>
                        setNotifPayload((prev) => ({
                          ...prev,
                          platform: p.id,
                        }))
                      }
                      className={clsx(
                        "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                        notifPayload.platform === p.id
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {p.icon}
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Type size={12} />
                    Title
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={notifPayload.title}
                    onChange={(e) =>
                      setNotifPayload((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    placeholder="Notification title"
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <MessageSquare size={12} />
                    Body
                  </label>
                  <textarea
                    className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={notifPayload.body}
                    onChange={(e) =>
                      setNotifPayload((prev) => ({
                        ...prev,
                        body: e.target.value,
                      }))
                    }
                    placeholder="Notification body text..."
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <Image size={12} />
                    Image URL (optional)
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={notifPayload.imageUrl}
                    onChange={(e) =>
                      setNotifPayload((prev) => ({
                        ...prev,
                        imageUrl: e.target.value,
                      }))
                    }
                    placeholder="https://example.com/image.png"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Badge Count
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={notifPayload.badge}
                      onChange={(e) =>
                        setNotifPayload((prev) => ({
                          ...prev,
                          badge: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Action URL
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-all focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={notifPayload.actionUrl}
                      onChange={(e) =>
                        setNotifPayload((prev) => ({
                          ...prev,
                          actionUrl: e.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview side */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 p-6">
              <h3 className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                Live Preview —{" "}
                {PLATFORMS.find((p) => p.id === notifPayload.platform)?.label}
              </h3>
              <DevicePreview payload={notifPayload} />
            </div>

            {/* JSON Output */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Payload JSON
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(notifPayload, null, 2))
                  }
                  className="rounded-lg px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  {copied ? (
                    <CheckCircle2 size={14} className="text-emerald-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-indigo-300">
                {JSON.stringify(notifPayload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Webhook Tester Tab ── */}
      {activeTab === "webhook" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Config side */}
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                  Target Endpoint
                </label>
                <div className="group relative">
                  <Terminal className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-600" />
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pe-4 ps-11 font-mono text-sm shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Event Template
                  </label>
                  <div className="flex gap-1.5">
                    {EVENT_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleTemplateChange(t.id)}
                        className={clsx(
                          "rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all",
                          selectedTemplate.id === t.id
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    className="h-64 w-full resize-none rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs text-indigo-300 shadow-inner outline-none focus:ring-2 focus:ring-indigo-500/20"
                    value={payload}
                    onChange={(e) => setPayload(e.target.value)}
                  />
                  <button
                    onClick={() => copyToClipboard(payload)}
                    className="absolute end-3 top-3 rounded-lg bg-slate-800 p-1.5 text-slate-400 transition-colors hover:text-white"
                  >
                    {copied ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>

              <Button
                className="h-12 w-full rounded-xl bg-indigo-600 text-base font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700"
                onClick={runSimulation}
                disabled={isSimulating}
              >
                {isSimulating ? (
                  <Loader2 className="me-2 animate-spin" size={18} />
                ) : (
                  <Send className="me-2" size={18} />
                )}
                Send Test Webhook
              </Button>
            </div>

            {/* Response side */}
            <div className="flex flex-col">
              <label className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                Response
              </label>
              <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                {!lastResponse && !isSimulating && (
                  <div className="flex flex-1 items-center justify-center p-8">
                    <EmptyState
                      icon={<Code2 className="h-6 w-6" />}
                      title="Ready"
                      description="Send a test webhook to see the response."
                    />
                  </div>
                )}

                {isSimulating && (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="space-y-3 text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
                      <p className="text-sm font-semibold text-indigo-600">
                        Sending...
                      </p>
                    </div>
                  </div>
                )}

                {lastResponse && !isSimulating && (
                  <div className="flex-1 p-4">
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className={clsx(
                          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold",
                          lastResponse.status >= 200 &&
                            lastResponse.status < 300
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-rose-50 text-rose-600",
                        )}
                      >
                        <div
                          className={clsx(
                            "h-2 w-2 rounded-full",
                            lastResponse.status >= 200 &&
                              lastResponse.status < 300
                              ? "bg-emerald-500"
                              : "bg-rose-500",
                          )}
                        />
                        {lastResponse.status} {lastResponse.statusText}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h5 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Headers
                        </h5>
                        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3">
                          {Object.entries(lastResponse.headers).map(
                            ([k, v]: [any, any]) => (
                              <div
                                key={k}
                                className="flex justify-between text-[11px]"
                              >
                                <span className="font-mono text-slate-500">
                                  {k}
                                </span>
                                <span className="font-semibold text-slate-800">
                                  {v}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                      <div>
                        <h5 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Body
                        </h5>
                        <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                          {JSON.stringify(lastResponse.body, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Run History */}
              {runs.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <Clock className="h-3 w-3" />
                    Recent
                  </p>
                  {runs.slice(0, 5).map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
                    >
                      <Badge
                        variant={
                          run.status >= 200 && run.status < 300
                            ? "success"
                            : "error"
                        }
                      >
                        {run.status || "ERR"}
                      </Badge>
                      <span className="font-mono text-[11px] text-slate-400">
                        {run.timestamp.toLocaleTimeString()} — {run.event}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
