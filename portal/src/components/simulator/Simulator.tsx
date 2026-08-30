import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  Radio,
  Search,
  Send,
  Smartphone,
  Webhook,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../context/AuthContext";
import {
  simulatorService,
  type SimDevice,
  type SimUser,
  type WebhookSimulationResult,
} from "../../services/simulatorService";
import { ProviderBrandIcon } from "../ui/BrandIcons";
import {
  DevicePreview,
  PREVIEW_PLATFORMS,
  type PreviewPlatform,
} from "./DevicePreview";

type SimTab = "push" | "webhook";

/* ─────────────────────────  Push tester  ───────────────────────── */

interface PushResult {
  ok: boolean;
  message: string;
  detail?: string;
  at: Date;
}

function PushTester() {
  const { selectedApp } = useAppContext();
  const { token } = useAuth();
  const appId = selectedApp?.id || "";

  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<SimUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SimUser | null>(null);

  const [devices, setDevices] = useState<SimDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<SimDevice | null>(null);

  const [title, setTitle] = useState("Your order shipped");
  const [body, setBody] = useState(
    "Tap to track your delivery — arriving tomorrow.",
  );
  const [image, setImage] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [platform, setPlatform] = useState<PreviewPlatform>("ios");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  // Load reachable users for the selected app.
  useEffect(() => {
    if (!appId || !token) return;
    let cancelled = false;
    setUsersLoading(true);
    const handle = setTimeout(() => {
      void simulatorService
        .listReachableUsers(appId, token, search || undefined)
        .then((rows) => {
          if (cancelled) return;
          setUsers(rows);
        })
        .catch(() => !cancelled && setUsers([]))
        .finally(() => !cancelled && setUsersLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [appId, token, search]);

  // Reset the target when the app changes underneath us.
  useEffect(() => {
    setSelectedUser(null);
    setSelectedDevice(null);
    setDevices([]);
  }, [appId]);

  useEffect(() => {
    if (!appId || !token || !selectedUser) {
      setDevices([]);
      return;
    }
    let cancelled = false;
    setDevicesLoading(true);
    void simulatorService
      .listDevices(appId, selectedUser.id, token)
      .then((rows) => {
        if (cancelled) return;
        setDevices(rows);
        setSelectedDevice(rows[0] || null);
        if (rows[0]) setPlatform(normalisePlatform(rows[0].platform));
      })
      .catch(() => !cancelled && setDevices([]))
      .finally(() => !cancelled && setDevicesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [appId, token, selectedUser]);

  const canSend = Boolean(
    appId && selectedDevice && title.trim() && body.trim() && !sending,
  );

  const send = async () => {
    if (!canSend || !selectedDevice) return;
    setSending(true);
    setResult(null);
    try {
      await simulatorService.sendTestPush(
        {
          appId,
          deviceId: selectedDevice.id,
          title: title.trim(),
          body: body.trim(),
          ...(image.trim() ? { image: image.trim() } : {}),
          ...(actionUrl.trim()
            ? { actionUrl: actionUrl.trim(), tapActionType: "open_url" as const }
            : {}),
        },
        token,
      );
      setResult({
        ok: true,
        message: "Queued for delivery",
        detail: `Sent to ${selectedDevice.platform}/${selectedDevice.provider} device ${selectedDevice.id.slice(0, 8)}… — check the device, then Notification History for the delivery record.`,
        at: new Date(),
      });
    } catch (error: any) {
      setResult({
        ok: false,
        message: "Send failed",
        detail: error?.message || "Unknown error",
        at: new Date(),
      });
    } finally {
      setSending(false);
    }
  };

  if (!appId) {
    return (
      <EmptyHint
        title="No app selected"
        detail="Pick an app from the switcher in the header to choose a test recipient."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* Recipient */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Smartphone size={15} className="text-slate-500" />
              Recipient
            </h4>
            <span className="text-[11px] text-slate-400">
              only users with a live device
            </span>
          </header>

          <div className="space-y-3 p-4">
            <div className="relative">
              <Search
                size={15}
                className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone or user ID…"
                className="w-full rounded-lg border border-slate-200 py-2 pe-3 ps-9 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100">
              {usersLoading ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">
                  <Loader2 size={15} className="mx-auto animate-spin" />
                </p>
              ) : users.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-sm text-slate-500">
                    No users with an active device.
                  </p>
                  <Link
                    to="/users"
                    className="mt-1 inline-block text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Open Users &amp; Devices
                  </Link>
                </div>
              ) : (
                users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUser(user)}
                    className={clsx(
                      "flex w-full items-center gap-3 border-b border-slate-50 px-3 py-2.5 text-start transition-colors last:border-0",
                      selectedUser?.id === user.id
                        ? "bg-blue-50"
                        : "hover:bg-slate-50",
                    )}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {(user.nickname || user.externalUserId)
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {user.nickname || user.externalUserId}
                      </p>
                      <p className="truncate font-mono text-[11px] text-slate-400">
                        {user.phone || user.externalUserId}
                      </p>
                    </div>
                    {selectedUser?.id === user.id && (
                      <CheckCircle2 size={15} className="shrink-0 text-blue-600" />
                    )}
                  </button>
                ))
              )}
            </div>

            {selectedUser && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Device
                </p>
                {devicesLoading ? (
                  <Loader2 size={15} className="animate-spin text-slate-400" />
                ) : devices.length === 0 ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This user has no device with a valid token right now.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {devices.map((device) => (
                      <button
                        key={device.id}
                        type="button"
                        onClick={() => {
                          setSelectedDevice(device);
                          setPlatform(normalisePlatform(device.platform));
                        }}
                        className={clsx(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                          selectedDevice?.id === device.id
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        <ProviderBrandIcon provider={device.provider} size={14} />
                        <span className="capitalize">{device.platform}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {(device.externalDeviceId || device.id).slice(0, 8)}…
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Composer */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-100 px-4 py-3">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Bell size={15} className="text-slate-500" />
              Message
            </h4>
          </header>
          <div className="space-y-3 p-4">
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </Field>
            <Field label="Body">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Image URL" hint="optional">
                <input
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://…/banner.png"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="Tap URL" hint="optional">
                <input
                  value={actionUrl}
                  onChange={(e) => setActionUrl(e.target.value)}
                  placeholder="https://example.com/orders/123"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">
                {selectedDevice ? (
                  <>
                    Delivers for real to{" "}
                    <strong className="text-slate-700">
                      {selectedUser?.nickname || selectedUser?.externalUserId}
                    </strong>
                  </>
                ) : (
                  "Pick a recipient device to enable sending."
                )}
              </p>
              <Button onClick={send} disabled={!canSend} size="sm">
                {sending ? (
                  <Loader2 size={14} className="me-1.5 animate-spin" />
                ) : (
                  <Send size={14} className="me-1.5" />
                )}
                Send test push
              </Button>
            </div>

            {result && (
              <div
                className={clsx(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
                  result.ok
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-rose-200 bg-rose-50",
                )}
              >
                {result.ok ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
                )}
                <div className="min-w-0">
                  <p
                    className={clsx(
                      "text-sm font-semibold",
                      result.ok ? "text-emerald-800" : "text-rose-800",
                    )}
                  >
                    {result.message}
                  </p>
                  {result.detail && (
                    <p
                      className={clsx(
                        "mt-0.5 text-xs leading-relaxed",
                        result.ok ? "text-emerald-700" : "text-rose-700",
                      )}
                    >
                      {result.detail}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Live preview */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PREVIEW_PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                platform === p.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <DevicePreview
            platform={platform}
            payload={{
              title,
              body,
              image: image.trim() || undefined,
              appName: selectedApp?.name || "NotifyX",
              iconUrl: selectedApp?.notificationIconUrl,
              actionLabel: actionUrl.trim() ? "Open" : null,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function normalisePlatform(platform: string): PreviewPlatform {
  const p = platform.toLowerCase();
  if (p === "ios" || p === "android" || p === "huawei" || p === "web") return p;
  return "android";
}

/* ─────────────────────────  Webhook tester  ───────────────────────── */

const WEBHOOK_TEMPLATES: {
  id: string;
  label: string;
  payload: Record<string, unknown>;
}[] = [
  {
    id: "notification.sent",
    label: "Sent",
    payload: {
      notificationId: "ntf_78210",
      externalUserId: "user-123",
      provider: "fcm",
      platform: "android",
    },
  },
  {
    id: "notification.delivered",
    label: "Delivered",
    payload: {
      notificationId: "ntf_78210",
      externalUserId: "user-123",
      provider: "apns",
      platform: "ios",
      deliveredAt: "2026-01-01T12:00:00.000Z",
    },
  },
  {
    id: "notification.failed",
    label: "Failed",
    payload: {
      notificationId: "ntf_78210",
      externalUserId: "user-123",
      provider: "fcm",
      failureCategory: "TOKEN_INVALID",
      error: "Requested entity was not found.",
    },
  },
  {
    id: "campaign.completed",
    label: "Campaign done",
    payload: {
      campaignId: "cmp_5512",
      totalTargets: 12480,
      delivered: 11902,
      failed: 578,
    },
  },
];

interface WebhookRun {
  id: string;
  at: Date;
  event: string;
  status: number;
  ok: boolean;
  durationMs: number;
}

function WebhookTester() {
  const { selectedApp } = useAppContext();
  const { token } = useAuth();
  const appId = selectedApp?.id || "";

  const [template, setTemplate] = useState(WEBHOOK_TEMPLATES[0]!);
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(WEBHOOK_TEMPLATES[0]!.payload, null, 2),
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WebhookSimulationResult | null>(null);
  const [runs, setRuns] = useState<WebhookRun[]>([]);

  const payloadValid = useMemo(() => {
    try {
      const parsed = JSON.parse(payloadText);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    } catch {
      return false;
    }
  }, [payloadText]);

  const pick = (id: string) => {
    const next = WEBHOOK_TEMPLATES.find((t) => t.id === id)!;
    setTemplate(next);
    setPayloadText(JSON.stringify(next.payload, null, 2));
  };

  const run = async () => {
    if (!appId || !payloadValid) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await simulatorService.simulateWebhook(
        appId,
        { event: template.id, payload: JSON.parse(payloadText) },
        token,
      );
      setResult(res);
      setRuns((prev) => [
        {
          id: `${Date.now()}`,
          at: new Date(),
          event: template.id,
          status: res.response.status,
          ok: res.response.ok,
          durationMs: res.response.durationMs,
        },
        ...prev.slice(0, 7),
      ]);
    } catch (err: any) {
      setError(err?.message || "Simulation failed");
    } finally {
      setRunning(false);
    }
  };

  if (!appId) {
    return (
      <EmptyHint
        title="No app selected"
        detail="Pick an app from the switcher in the header to simulate its webhook."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Event
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {WEBHOOK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                className={clsx(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  template.id === t.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              data payload
            </p>
            {!payloadValid && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
                <AlertTriangle size={11} /> not valid JSON
              </span>
            )}
          </div>
          <textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={11}
            spellCheck={false}
            className={clsx(
              "w-full rounded-lg border bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-200 outline-none",
              payloadValid
                ? "border-slate-800 focus:border-blue-500"
                : "border-rose-500",
            )}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-snug text-slate-500">
              Delivered by the API to this app's configured webhook, signed with
              its real secret.
            </p>
            <Button
              onClick={run}
              disabled={running || !payloadValid}
              size="sm"
              className="shrink-0"
            >
              {running ? (
                <Loader2 size={14} className="me-1.5 animate-spin" />
              ) : (
                <Radio size={14} className="me-1.5" />
              )}
              Deliver
            </Button>
          </div>
        </div>

        {runs.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recent runs
            </p>
            <ul className="divide-y divide-slate-50">
              {runs.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-2 text-xs"
                >
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 font-mono font-bold",
                      r.ok
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700",
                    )}
                  >
                    {r.status || "ERR"}
                  </span>
                  <span className="flex-1 truncate font-medium text-slate-700">
                    {r.event}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Clock size={11} />
                    {r.durationMs}ms
                  </span>
                  <span className="text-slate-400">
                    {r.at.toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <XCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
            <div>
              <p className="text-sm font-semibold text-rose-800">
                Could not deliver
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-rose-700">{error}</p>
              {/NO_WEBHOOK_URL|webhook URL/i.test(error) && (
                <Link
                  to="/devx"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-800 hover:underline"
                >
                  Configure a webhook URL <ChevronRight size={12} />
                </Link>
              )}
            </div>
          </div>
        )}

        {!result && !error && (
          <EmptyHint
            title="No delivery yet"
            detail="Hit Deliver to send the payload to your webhook. You'll get back the exact request that was signed and everything the endpoint returned."
          />
        )}

        {result && (
          <>
            <div
              className={clsx(
                "rounded-xl border p-4",
                result.response.ok
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50",
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={clsx(
                    "rounded-lg px-2 py-1 font-mono text-sm font-bold",
                    result.response.ok
                      ? "bg-emerald-600 text-white"
                      : "bg-rose-600 text-white",
                  )}
                >
                  {result.response.status || "—"}
                </span>
                <span
                  className={clsx(
                    "text-sm font-semibold",
                    result.response.ok ? "text-emerald-800" : "text-rose-800",
                  )}
                >
                  {result.response.statusText}
                </span>
                <span className="ms-auto flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={12} /> {result.response.durationMs}ms
                </span>
              </div>
              <p className="mt-2 truncate font-mono text-[11px] text-slate-600">
                POST {result.request.url}
              </p>
            </div>

            <Panel title="Request headers" copyText={JSON.stringify(result.request.headers, null, 2)}>
              <dl className="space-y-1">
                {Object.entries(result.request.headers).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-[11px]">
                    <dt className="shrink-0 font-mono font-semibold text-slate-500">
                      {k}
                    </dt>
                    <dd className="min-w-0 break-all font-mono text-slate-700">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-500">
                Verify with an HMAC-SHA256 of the raw body using your webhook
                secret, and compare against <code>X-NotifyX-Signature</code>.
              </p>
            </Panel>

            <Panel title="Request body" copyText={JSON.stringify(result.request.body, null, 2)}>
              <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-slate-700">
                {JSON.stringify(result.request.body, null, 2)}
              </pre>
            </Panel>

            <Panel title="Response body" copyText={result.response.body}>
              <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-slate-700">
                {result.response.body || "(empty)"}
              </pre>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  Shared bits  ───────────────────────── */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
        {hint && <span className="font-normal normal-case text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Panel({
  title,
  copyText,
  children,
}: {
  title: string;
  copyText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>
        {copyText && (
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(copyText)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Copy"
          >
            <Copy size={12} />
          </button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyHint({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500">
        {detail}
      </p>
    </div>
  );
}

/* ─────────────────────────  Shell  ───────────────────────── */

export function Simulator() {
  const [tab, setTab] = useState<SimTab>("push");

  const tabs: { id: SimTab; label: string; icon: React.ReactNode }[] = [
    { id: "push", label: "Test push", icon: <Bell size={14} /> },
    { id: "webhook", label: "Webhook", icon: <Webhook size={14} /> },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 pb-0 pt-6">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-slate-900">Simulator</h3>
            <p className="mt-1 text-sm text-slate-500">
              Send a real push to one of your own devices, or deliver a signed
              webhook event to your endpoint — both go through the API, not the
              browser.
            </p>
          </div>
          <div className="-mb-px flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-all",
                  tab === t.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-6">
          {tab === "push" ? <PushTester /> : <WebhookTester />}
        </div>
      </div>
    </div>
  );
}
