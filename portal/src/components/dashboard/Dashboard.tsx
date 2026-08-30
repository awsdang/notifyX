import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Send,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "../../context/AuthContext";
import { useAppContext } from "../../context/AppContext";
import {
  getDashboardOverview,
  type DashboardOverview,
} from "../../services/statsService";
import { Skeleton } from "../ui/Skeleton";
import { ProviderBrandIcon } from "../ui/BrandIcons";
import { DeliveryTrend } from "./DeliveryTrend";

/* ─────────────────────────  KPI card  ───────────────────────── */

function Kpi({
  label,
  value,
  sub,
  icon,
  tone = "slate",
  delta,
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "slate" | "emerald" | "rose" | "blue" | "amber";
  delta?: number | null;
  to?: string;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
  };

  const inner = (
    <div className="h-full rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <span className={clsx("rounded-lg p-2", tones[tone])}>{icon}</span>
        {typeof delta === "number" && (
          <span
            className={clsx(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
              delta >= 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700",
            )}
          >
            {delta >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-black tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-600">{label}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-slate-400">{sub}</p>}
    </div>
  );

  return to ? (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/* ─────────────────────────  Delivery funnel  ───────────────────────── */

function DeliveryFunnel({ data }: { data: DashboardOverview }) {
  const { delivery, notifications } = data;
  const pending = notifications.pending + notifications.processing;

  const bars = [
    {
      label: "Delivered",
      value: delivery.delivered,
      colour: "bg-emerald-500",
      text: "text-emerald-700",
    },
    {
      label: "Failed",
      value: delivery.failed,
      colour: "bg-rose-400",
      text: "text-rose-700",
    },
  ];
  const total = Math.max(1, delivery.attempted);

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Delivery funnel</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Per-device attempts across all time
      </p>

      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
        {bars.map((bar) => (
          <div
            key={bar.label}
            className={bar.colour}
            style={{ width: `${(bar.value / total) * 100}%` }}
            title={`${bar.label}: ${bar.value.toLocaleString()}`}
          />
        ))}
      </div>

      <dl className="mt-4 space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-baseline justify-between">
            <dt className="flex items-center gap-2 text-xs text-slate-600">
              <span className={clsx("h-2.5 w-2.5 rounded-sm", bar.colour)} />
              {bar.label}
            </dt>
            <dd className={clsx("text-sm font-bold", bar.text)}>
              {bar.value.toLocaleString()}
              <span className="ms-1.5 text-[11px] font-medium text-slate-400">
                {Math.round((bar.value / total) * 100)}%
              </span>
            </dd>
          </div>
        ))}
        {pending > 0 && (
          <div className="flex items-baseline justify-between border-t border-slate-100 pt-2.5">
            <dt className="flex items-center gap-2 text-xs text-slate-600">
              <Clock size={12} className="text-amber-500" />
              In flight
            </dt>
            <dd className="text-sm font-bold text-amber-600">
              {pending.toLocaleString()}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/* ─────────────────────────  Provider health  ───────────────────────── */

const PROVIDER_LABELS: Record<string, string> = {
  fcm: "Firebase (Android)",
  apns: "Apple (iOS)",
  hms: "Huawei",
  web: "Web Push",
};

function ProviderHealth({ providers }: { providers: DashboardOverview["providers"] }) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Provider health</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Success rate per transport
      </p>

      {providers.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-400">
          No deliveries recorded yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3.5">
          {providers.map((p) => {
            const healthy = p.successRate >= 95;
            const warn = p.successRate >= 80 && p.successRate < 95;
            return (
              <li key={p.provider}>
                <div className="mb-1.5 flex items-center gap-2">
                  <ProviderBrandIcon provider={p.provider} size={16} />
                  <span className="flex-1 truncate text-xs font-semibold text-slate-700">
                    {PROVIDER_LABELS[p.provider] || p.provider.toUpperCase()}
                  </span>
                  <span
                    className={clsx(
                      "text-xs font-bold",
                      healthy
                        ? "text-emerald-600"
                        : warn
                          ? "text-amber-600"
                          : "text-rose-600",
                    )}
                  >
                    {p.successRate}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={clsx(
                      "h-full rounded-full",
                      healthy
                        ? "bg-emerald-500"
                        : warn
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    )}
                    style={{ width: `${Math.max(2, p.successRate)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {p.attempted.toLocaleString()} attempts ·{" "}
                  {p.failed.toLocaleString()} failed
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────  Failure reasons  ───────────────────────── */

const FAILURE_HINTS: Record<string, string> = {
  TOKEN_INVALID: "Stale device tokens — deactivate or refresh them",
  UNREGISTERED: "App uninstalled or token revoked by the provider",
  RATE_LIMITED: "Provider is throttling — slow the send rate",
  AUTH_ERROR: "Credential rejected — check the provider key",
  PAYLOAD_TOO_LARGE: "Trim the notification payload",
  NETWORK: "Transient network failure — safe to replay",
  UNKNOWN: "No category reported by the provider",
};

function FailureReasons({ failures }: { failures: DashboardOverview["failures"] }) {
  if (failures.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <h3 className="text-sm font-bold text-emerald-900">No failures</h3>
        </div>
        <p className="mt-1 text-xs text-emerald-700">
          Every delivery attempt so far has succeeded.
        </p>
      </div>
    );
  }

  const max = Math.max(...failures.map((f) => f.count));

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <AlertTriangle size={14} className="text-amber-500" />
        Why deliveries fail
      </h3>
      <ul className="mt-4 space-y-3">
        {failures.map((f) => (
          <li key={f.category}>
            <div className="flex items-baseline justify-between gap-2">
              <code className="truncate font-mono text-[11px] font-semibold text-slate-700">
                {f.category}
              </code>
              <span className="shrink-0 text-xs font-bold text-slate-900">
                {f.count.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${Math.max(3, (f.count / max) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-400">
              {FAILURE_HINTS[f.category] || "Provider-specific failure"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────  Recent activity  ───────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  DELIVERED: "bg-emerald-50 text-emerald-700",
  SENT: "bg-sky-50 text-sky-700",
  FAILED: "bg-rose-50 text-rose-700",
  PENDING: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

function RecentActivity({
  items,
}: {
  items: DashboardOverview["recentActivity"];
}) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Activity size={14} className="text-slate-500" />
          Latest sends
        </h3>
        <Link
          to="/history"
          className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          History <ChevronRight size={13} />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">
          Nothing sent yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-5 py-3">
              <span
                className={clsx(
                  "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  STATUS_STYLES[item.status] || "bg-slate-100 text-slate-600",
                )}
              >
                {item.status}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {item.title}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {item.app?.name ? `${item.app.name} · ` : ""}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────────  App breakdown  ───────────────────────── */

function AppBreakdown({ apps }: { apps: DashboardOverview["apps"] }) {
  const max = Math.max(1, ...apps.map((a) => a.notifications));
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h3 className="text-sm font-bold text-slate-900">Apps</h3>
        <Link
          to="/apps"
          className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Manage <ChevronRight size={13} />
        </Link>
      </div>
      <ul className="divide-y divide-slate-50">
        {apps.map((app) => (
          <li key={app.id}>
            <Link
              to={`/apps/${app.id}`}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
            >
              {app.iconUrl ? (
                <img
                  src={app.iconUrl}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 text-xs font-black text-white">
                  {app.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {app.name}
                  </p>
                  {app.isKilled && (
                    <span className="rounded bg-rose-50 px-1 py-0.5 text-[9px] font-bold text-rose-600">
                      OFF
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{
                      width: `${Math.max(2, (app.notifications / max) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-slate-900">
                  {app.notifications.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-400">
                  {app.users.toLocaleString()} users
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────  Shell  ───────────────────────── */

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200/60 bg-white p-5"
          >
            <Skeleton className="mb-3 h-9 w-9 rounded-lg" />
            <Skeleton className="mb-2 h-7 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
            <Skeleton className="mb-5 h-4 w-40" />
            <Skeleton className="h-44 w-full" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { token } = useAuth();
  const { selectedApp, apps } = useAppContext();
  const navigate = useNavigate();

  const [days, setDays] = useState(14);
  const [scopeToApp, setScopeToApp] = useState(true);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scopedAppId = scopeToApp && selectedApp ? selectedApp.id : null;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const res = await getDashboardOverview(token, {
          appId: scopedAppId,
          days,
        });
        if (!cancelled) setData(res);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, scopedAppId, days]);

  if (isLoading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <p className="font-semibold">Couldn't load the dashboard</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { notifications, delivery, audience } = data;
  const hasNothing = notifications.total === 0 && audience.devices === 0;

  return (
    <div className="space-y-5">
      {/* Scope switch */}
      {apps.length > 1 && selectedApp && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Showing</span>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setScopeToApp(true)}
              className={clsx(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                scopeToApp ? "bg-slate-900 text-white" : "text-slate-500",
              )}
            >
              {selectedApp.name}
            </button>
            <button
              type="button"
              onClick={() => setScopeToApp(false)}
              className={clsx(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                !scopeToApp ? "bg-slate-900 text-white" : "text-slate-500",
              )}
            >
              All apps ({apps.length})
            </button>
          </div>
        </div>
      )}

      {hasNothing && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-bold text-blue-900">Nothing to show yet</p>
          <p className="mt-1 text-sm text-blue-800">
            Once a device registers and you send your first notification, this
            page fills in with delivery rates, provider health and failure
            reasons.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/devx"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Integrate an SDK
            </Link>
            <Link
              to="/simulator"
              className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
            >
              Send a test push
            </Link>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={`Sent in last ${days} days`}
          value={notifications.inWindow.toLocaleString()}
          sub={`${notifications.total.toLocaleString()} all time`}
          icon={<Send size={16} />}
          tone="blue"
          delta={notifications.changePct}
        />
        <Kpi
          label="Delivery success"
          value={`${delivery.successRate}%`}
          sub={`${delivery.delivered.toLocaleString()} of ${delivery.attempted.toLocaleString()} attempts`}
          icon={<CheckCircle2 size={16} />}
          tone={delivery.successRate >= 95 ? "emerald" : delivery.successRate >= 80 ? "amber" : "rose"}
        />
        <Kpi
          label="Reachable audience"
          value={audience.reachableUsers.toLocaleString()}
          sub={`${audience.reachablePct}% of ${audience.users.toLocaleString()} users have a live device`}
          icon={<Users size={16} />}
          tone="slate"
          to="/users"
        />
        <Kpi
          label="Active devices"
          value={audience.devices.toLocaleString()}
          sub={
            audience.byPlatform
              .map((p) => `${p.count.toLocaleString()} ${p.platform}`)
              .join(" · ") || "none registered"
          }
          icon={<Smartphone size={16} />}
          tone="slate"
          to="/users"
        />
      </div>

      {/* Trend + funnel */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DeliveryTrend trend={data.trend} days={days} onDaysChange={setDays} />
        </div>
        <DeliveryFunnel data={data} />
      </div>

      {/* Provider health + failures + activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ProviderHealth providers={data.providers} />
        <FailureReasons failures={data.failures} />
        <RecentActivity items={data.recentActivity} />
      </div>

      {/* Apps + quick actions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {data.apps.length > 0 && <AppBreakdown apps={data.apps} />}
        </div>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => navigate("/send")}
            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-start text-white shadow-lg shadow-blue-200/30 transition-all hover:shadow-xl"
          >
            <div className="absolute -end-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
            <Send className="mb-2 h-5 w-5" />
            <h4 className="text-sm font-bold">Send a notification</h4>
            <p className="mt-0.5 text-xs text-blue-100">
              One-off push to a segment or a list of users.
            </p>
          </button>
          <button
            type="button"
            onClick={() => navigate("/automation")}
            className="w-full rounded-2xl border border-slate-200/60 bg-white p-5 text-start shadow-sm transition-all hover:shadow-md"
          >
            <Zap className="mb-2 h-5 w-5 text-amber-500" />
            <h4 className="text-sm font-bold text-slate-900">Automation</h4>
            <p className="mt-0.5 text-xs text-slate-500">
              Trigger notifications from events your backend fires.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
