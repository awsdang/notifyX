import {
  BarChart2,
  CheckCircle2,
  Clock,
  Key,
  Send,
  Smartphone,
  TrendingUp,
  Zap,
} from "lucide-react";
import { StatCard } from "./StatCard";
import { Button } from "./ui/button";
import { ActivityFeed } from "./ActivityFeed";
import { Skeleton } from "./ui/Skeleton";
import type { Stats } from "../types";
import { useScopedTranslation } from "../context/I18nContext";

interface DashboardProps {
  stats: Stats | null;
  isLoading: boolean;
  setActiveTab: (tab: string) => void;
}

export function Dashboard({ stats, isLoading, setActiveTab }: DashboardProps) {
  const td = useScopedTranslation("components", "Dashboard");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200/60 bg-white p-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200/60 bg-white p-6">
              <Skeleton className="mb-6 h-5 w-40" />
              <Skeleton className="h-40 w-full" />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/60 bg-white p-6">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={td("totalNotifications", "Total Sent")}
          value={stats?.notifications?.total?.toLocaleString() || "0"}
          color="blue"
          icon={<Send size={18} />}
        />
        <StatCard
          title={td("deliverySuccessRate", "Success Rate")}
          value={`${stats?.delivery?.successRate || 0}%`}
          color="green"
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          title={td("pendingQueue", "Pending")}
          value={stats?.notifications?.pending?.toLocaleString() || "0"}
          color="purple"
          icon={<Clock size={18} />}
        />
        <StatCard
          title={td("activeDevices", "Devices")}
          value={stats?.resources?.devices?.toLocaleString() || "0"}
          color="blue"
          icon={<Smartphone size={18} />}
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart + Quick Stats */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                {td("deliveryInsights", "Delivery Trend")}
              </h3>
              <div className="flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
                  {td("thisWeek", "This Week")}: <strong className="text-slate-900">{stats?.notifications?.thisWeek || 0}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-200" />
                  {td("thisMonth", "This Month")}: <strong className="text-slate-900">{stats?.notifications?.thisMonth || 0}</strong>
                </span>
              </div>
            </div>

            {/* Chart */}
            <div className="flex h-40 items-end gap-1.5 rounded-xl bg-slate-50 p-4">
              {stats?.trend && stats.trend.length > 0 ? (
                stats.trend.map((t, i) => {
                  const maxTotal = Math.max(...stats.trend.map((d) => d.total));
                  const h = maxTotal === 0 ? 0 : (t.total / maxTotal) * 100;
                  return (
                    <div
                      key={i}
                      className="group relative flex-1"
                      style={{ height: "100%" }}
                    >
                      <div
                        className="absolute bottom-0 w-full rounded-md bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-500 group-hover:from-blue-700 group-hover:to-blue-500"
                        style={{ height: `${Math.max(4, h)}%` }}
                      />
                      <div className="absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg group-hover:block">
                        {t.date}: {t.total}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                  <BarChart2 className="mr-2 h-4 w-4" />
                  {td("noData", "No trend data yet")}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-lg shadow-blue-200/30 transition-all hover:shadow-xl hover:shadow-blue-200/40">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
              <Zap className="mb-3 h-6 w-6" />
              <h4 className="mb-1 text-base font-bold">
                {td("automateJourneys", "Automation")}
              </h4>
              <p className="mb-4 text-sm text-blue-100">
                {td(
                  "automateJourneysDescription",
                  "Build trigger-based notification workflows.",
                )}
              </p>
              <Button
                onClick={() => setActiveTab("automation")}
                className="h-9 rounded-xl bg-white/20 px-4 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/30"
              >
                {td("startBuilder", "Start Builder")}
              </Button>
            </div>
            <div className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all hover:shadow-md">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-slate-100" />
              <Key className="mb-3 h-6 w-6 text-slate-700" />
              <h4 className="mb-1 text-base font-bold text-slate-900">
                {td("appCredentials", "Credentials")}
              </h4>
              <p className="mb-4 text-sm text-slate-500">
                {td(
                  "appCredentialsDescription",
                  "Manage APNS, FCM, and HMS keys securely.",
                )}
              </p>
              <button
                onClick={() => setActiveTab("credentials")}
                className="text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
              >
                {td("manageKeys", "Manage Keys")} &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-1">
          <ActivityFeed recentActivity={stats?.recentActivity} />
        </div>
      </div>
    </div>
  );
}
