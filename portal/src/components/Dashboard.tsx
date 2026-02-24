import { BarChart2, Megaphone } from "lucide-react";
import { StatCard } from "./StatCard";
import { Button } from "./ui/button";
import { ActivityFeed } from "./ActivityFeed";
import type { Stats } from "../types";
import { useScopedTranslation } from "../context/I18nContext";

interface DashboardProps {
  stats: Stats | null;
  isLoading: boolean;
  setActiveTab: (tab: string) => void;
}

export function Dashboard({ stats, isLoading, setActiveTab }: DashboardProps) {
  const td = useScopedTranslation("components", "Dashboard");

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        {/* Top Stats Row */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <StatCard
            title={td("totalNotifications", "Total Notifications")}
            value={stats?.notifications?.total?.toString() || "0"}
            color="blue"
          />
          <StatCard
            title={td("deliverySuccessRate", "Delivery Success Rate")}
            value={`${stats?.delivery?.successRate || 0}%`}
            color="purple"
          />
        </div>

        {/* Insights Section */}
        <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
          <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
            <BarChart2 className="h-5 w-5 text-blue-600" />
            {td("deliveryInsights", "Delivery Insights")}
          </h3>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              <div className="rounded-2xl border border-gray-50 bg-slate-50 p-4 text-center">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {td("thisWeek", "This Week")}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.notifications?.thisWeek || 0}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-50 bg-slate-50 p-4 text-center">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {td("thisMonth", "This Month")}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.notifications?.thisMonth || 0}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-50 bg-slate-50 p-4 text-center">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {td("pendingQueue", "Pending Queue")}
                </p>
                <p className="text-2xl font-bold text-amber-600">
                  {stats.notifications?.pending || 0}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-50 bg-slate-50 p-4 text-center">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {td("activeDevices", "Active Devices")}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.resources?.devices || 0}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400">
              {td("noData", "No data available for the current period.")}
            </div>
          )}

          {/* Dynamic Chart */}
          <div className="mt-10 flex h-32 items-end gap-2 px-2">
            {stats && stats.trend && stats.trend.length > 0 ? (
              stats.trend.map((t, i) => {
                const maxTotal = Math.max(...stats.trend.map(d => d.total));
                const h = maxTotal === 0 ? 0 : (t.total / maxTotal) * 100;
                return (
                  <div
                    key={i}
                    title={`${t.date}: ${t.total} notifications`}
                    className="animate-in slide-in-from-bottom flex-1 rounded-t-lg bg-linear-to-t from-blue-600 to-blue-400 transition-all duration-1000"
                    style={{ height: `${Math.max(5, h)}%`, opacity: 0.1 + (i / stats.trend.length) }}
                  />
                );
              })
            ) : (
              // Fallback mockup if no data
              [40, 70, 45, 90, 65, 80, 55, 95, 75, 85, 60, 100].map((h, i) => (
                <div
                  key={i}
                  className="animate-in slide-in-from-bottom flex-1 rounded-t-lg bg-linear-to-t from-blue-600 to-blue-400 transition-all duration-1000"
                  style={{ height: `${h}%`, opacity: 0.1 + i / 15 }}
                />
              ))
            )}
          </div>
        </div>

        {/* Low Row */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="rounded-[2.5rem] bg-linear-to-br from-indigo-600 to-blue-700 p-8 text-white shadow-xl shadow-indigo-200">
            <h4 className="mb-2 text-lg font-bold">
              {td("automateJourneys", "Automate Journeys")}
            </h4>
            <p className="mb-6 text-sm opacity-80">
              {td(
                "automateJourneysDescription",
                "Create complex trigger-based notification workflows with our new canvas.",
              )}
            </p>
            <Button
              onClick={() => setActiveTab("automation")}
              className="h-12 rounded-2xl bg-white px-6 font-bold text-indigo-700 shadow-lg hover:bg-slate-50"
            >
              {td("startBuilder", "Start Builder")}
            </Button>
          </div>
          <div className="flex flex-col justify-between rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
            <div>
              <h4 className="mb-2 text-lg font-bold text-gray-900">
                {td("appCredentials", "App Credentials")}
              </h4>
              <p className="text-sm text-gray-500">
                {td(
                  "appCredentialsDescription",
                  "Securely manage your APNS, FCM, and HMS keys in one encrypted location.",
                )}
              </p>
            </div>
            <button
              onClick={() => setActiveTab("credentials")}
              className="mt-6 flex items-center gap-1 text-sm font-bold text-blue-600 transition-transform hover:translate-x-1"
            >
              {td("manageKeys", "Manage Keys")} <Megaphone className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-1">
        <ActivityFeed recentActivity={stats?.recentActivity} />
      </div>
    </div>
  );
}
