import { useEffect, useState } from "react";
import { AlertTriangle, Info, PhoneCall, Users, WifiOff } from "lucide-react";
import { clsx } from "clsx";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

interface Reachability {
  appId: string;
  totalUsers: number;
  reachableUsers: number;
  unreachableUsers: number;
  neverRegistered: number;
  tokenWentDead: number;
  byReason: { reason: string; count: number }[];
  byPlatform: { platform: string; count: number }[];
  contactable: number;
  sweepEnabled: boolean;
}

const REASON_LABELS: Record<string, string> = {
  INVALID_TOKEN_AUTO: "Provider rejected the token during a send",
  INVALID_TOKEN_SWEEP: "Provider rejected the token during a health sweep",
  UNKNOWN: "Deactivated without a recorded reason",
};

/**
 * Explains *why* an app's users are unreachable, because the fix differs
 * completely by cause — and the raw "0 devices" count hides that.
 */
export function ReachabilityPanel({
  appId,
  onFilter,
}: {
  appId: string;
  onFilter: (value: "never_registered" | "token_dead") => void;
}) {
  const { token } = useAuth();
  const [data, setData] = useState<Reachability | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appId || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<Reachability>(
          `/users/reachability?appId=${appId}`,
          {},
          token,
        );
        if (!cancelled) setData(res);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId, token]);

  if (error || !data) return null;
  if (data.totalUsers === 0) return null;

  const reachablePct = Math.round(
    (data.reachableUsers / Math.max(1, data.totalUsers)) * 100,
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Users size={15} className="text-slate-500" />
            Reachability
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            {data.reachableUsers.toLocaleString()} of{" "}
            {data.totalUsers.toLocaleString()} users have a device with a live
            push token
          </p>
        </div>
        <span
          className={clsx(
            "rounded-lg px-2.5 py-1 text-sm font-bold",
            reachablePct >= 80
              ? "bg-emerald-50 text-emerald-700"
              : reachablePct >= 50
                ? "bg-amber-50 text-amber-700"
                : "bg-rose-50 text-rose-700",
          )}
        >
          {reachablePct}%
        </span>
      </div>

      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="bg-emerald-500"
          style={{ width: `${(data.reachableUsers / data.totalUsers) * 100}%` }}
        />
        <div
          className="bg-amber-400"
          style={{ width: `${(data.tokenWentDead / data.totalUsers) * 100}%` }}
        />
        <div
          className="bg-slate-300"
          style={{
            width: `${(data.neverRegistered / data.totalUsers) * 100}%`,
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onFilter("token_dead")}
          className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-start transition-colors hover:bg-amber-100"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <span className="text-lg font-black text-amber-900">
              {data.tokenWentDead.toLocaleString()}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-semibold text-amber-900">
            Token went dead
          </p>
          <p className="mt-1 text-[11px] leading-snug text-amber-800">
            Had a working device the provider later rejected — usually an
            uninstall. Recovers by itself the next time the app launches and
            re-registers.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onFilter("never_registered")}
          className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-start transition-colors hover:bg-slate-100"
        >
          <div className="flex items-center gap-2">
            <WifiOff size={14} className="text-slate-500" />
            <span className="text-lg font-black text-slate-900">
              {data.neverRegistered.toLocaleString()}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-semibold text-slate-800">
            Never registered a device
          </p>
          <p className="mt-1 text-[11px] leading-snug text-slate-600">
            A user row exists but push setup never completed — permission
            denied, or the client never called{" "}
            <code className="font-mono">/users/device</code>. Push cannot reach
            these at all.
          </p>
        </button>
      </div>

      {data.contactable > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <PhoneCall size={13} className="mt-0.5 shrink-0 text-blue-600" />
          <p className="text-[11px] leading-snug text-blue-900">
            <strong>{data.contactable.toLocaleString()}</strong> of the
            unreachable users have a phone number on file — reachable over SMS
            to prompt a reinstall.
          </p>
        </div>
      )}

      {data.byReason.length > 0 && (
        <dl className="mt-3 space-y-1">
          {data.byReason.map((r) => (
            <div key={r.reason} className="flex items-baseline gap-2 text-[11px]">
              <dt className="shrink-0 font-mono font-semibold text-slate-600">
                {r.count.toLocaleString()}
              </dt>
              <dd className="text-slate-500">
                {REASON_LABELS[r.reason] || r.reason}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!data.sweepEnabled && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <Info size={13} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-[11px] leading-snug text-slate-500">
            Proactive token checking is off. Dead tokens are only discovered
            when a real send fails, so this count lags reality. Enable it with{" "}
            <code className="font-mono">DEVICE_HEALTH_ENABLED=true</code>.
          </p>
        </div>
      )}
    </div>
  );
}
