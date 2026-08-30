import { useState } from "react";
import { clsx } from "clsx";
import type { DashboardOverview } from "../../services/statsService";

/**
 * Stacked delivered/failed bars over the selected window.
 *
 * The previous chart plotted one flat total per day, which showed volume but
 * hid the thing that actually matters — whether those sends landed. Splitting
 * the bar makes a bad day visible at a glance.
 */
export function DeliveryTrend({
  trend,
  days,
  onDaysChange,
}: {
  trend: DashboardOverview["trend"];
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...trend.map((t) => t.total));
  const totals = trend.reduce(
    (acc, t) => ({
      total: acc.total + t.total,
      delivered: acc.delivered + t.delivered,
      failed: acc.failed + t.failed,
    }),
    { total: 0, delivered: 0, failed: 0 },
  );

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Delivery over time</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {totals.total.toLocaleString()} notifications ·{" "}
            <span className="text-emerald-600">
              {totals.delivered.toLocaleString()} delivered
            </span>
            {totals.failed > 0 && (
              <>
                {" · "}
                <span className="text-rose-600">
                  {totals.failed.toLocaleString()} failed
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Legend colour="bg-emerald-500" label="Delivered" />
          <Legend colour="bg-rose-400" label="Failed" />
          <Legend colour="bg-slate-200" label="Other" />
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDaysChange(d)}
                className={clsx(
                  "rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                  days === d
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="flex h-44 items-end gap-1">
          {trend.map((day, i) => {
            const other = Math.max(0, day.total - day.delivered - day.failed);
            const scale = (value: number) => (value / max) * 100;
            return (
              <div
                key={day.date}
                className="group relative flex h-full flex-1 flex-col justify-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {day.total === 0 ? (
                  <div className="h-[3px] w-full rounded-sm bg-slate-100" />
                ) : (
                  <>
                    <div
                      className="w-full rounded-t-sm bg-slate-200 transition-opacity"
                      style={{ height: `${scale(other)}%` }}
                    />
                    <div
                      className="w-full bg-rose-400 transition-opacity"
                      style={{ height: `${scale(day.failed)}%` }}
                    />
                    <div
                      className="w-full rounded-b-sm bg-emerald-500 transition-opacity"
                      style={{ height: `${scale(day.delivered)}%` }}
                    />
                  </>
                )}
                {hover === i && (
                  <div className="pointer-events-none absolute -top-1 left-1/2 z-10 w-36 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-2 text-[11px] text-white shadow-xl">
                    <p className="font-semibold">{day.date}</p>
                    <p className="mt-1 flex justify-between">
                      <span className="text-slate-400">Total</span>
                      <span>{day.total}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-emerald-400">Delivered</span>
                      <span>{day.delivered}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-rose-400">Failed</span>
                      <span>{day.failed}</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-400">
          <span>{trend[0]?.date}</span>
          <span>{trend[trend.length - 1]?.date}</span>
        </div>
      </div>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className={clsx("inline-block h-2.5 w-2.5 rounded-sm", colour)} />
      {label}
    </span>
  );
}
