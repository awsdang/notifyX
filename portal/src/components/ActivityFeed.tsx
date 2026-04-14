import { Bell, Zap, UserPlus, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { useMemo } from "react";
import { useScopedTranslation } from "../context/I18nContext";

interface ActivityItem {
  id: string;
  type: "notification" | "user" | "automation" | "alert";
  title: string;
  timestamp: string;
  description: string;
  status: "success" | "pending" | "warning" | "error";
  rawValue?: any;
}

interface ActivityFeedProps {
  recentActivity?: any[];
}

export function ActivityFeed({ recentActivity }: ActivityFeedProps) {
  const ta = useScopedTranslation("components", "ActivityFeed");

  const activities = useMemo<ActivityItem[]>(() => {
    if (!recentActivity || recentActivity.length === 0) {
      return [];
    }

    return recentActivity.map((n: any) => {
      let status: "success" | "pending" | "warning" | "error" = "pending";
      if (n.status === "COMPLETED" || n.status === "DELIVERED" || n.status === "SENT") status = "success";
      if (n.status === "FAILED") status = "error";
      if (n.status === "CANCELLED") status = "warning";

      const deliveries = n.deliverySummary?.totalDeliveries || 0;
      let platforms = "multiple platforms";
      if (n.payload?.platforms?.length) {
        platforms = n.payload.platforms.join(" and ");
      }

      const title = n.payload?.adhocContent?.title || `Notification to ${n.payload?.userIds?.length || 'users'}`;
      const desc = `Dispatched to ${deliveries} devices via ${platforms}.`;

      // Calculate a relative time string
      const date = new Date(n.createdAt);
      const diffStr = (() => {
        const diffMs = Date.now() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins} mins ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hours ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} days ago`;
      })();

      return {
        id: n.id,
        type: "notification" as const,
        title: title,
        timestamp: diffStr,
        description: desc,
        status,
        rawValue: n,
      };
    });
  }, [recentActivity, ta]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-bold text-slate-900">
          {ta("notificationHistory", "Recent Activity")}
        </h3>
        <p className="mt-0.5 text-xs text-slate-400">
          {ta(
            "notificationHistoryDescription",
            "Latest notification events",
          )}
        </p>
      </div>

      <div className="flex-1 divide-y divide-slate-50 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
            <Bell className="mb-3 h-8 w-8 text-slate-200" />
            <p className="text-sm font-medium text-slate-400">
              {ta("noNotifications", "No recent activity")}
            </p>
            <p className="mt-1 text-xs text-slate-300">
              Send a notification to see it here
            </p>
          </div>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/50"
            >
              <div
                className={clsx(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  activity.status === "success"
                    ? "bg-emerald-50 text-emerald-600"
                    : activity.status === "warning"
                      ? "bg-amber-50 text-amber-600"
                      : activity.status === "error"
                        ? "bg-rose-50 text-rose-600"
                        : "bg-blue-50 text-blue-600",
                )}
              >
                {activity.type === "notification" && <Bell size={14} />}
                {activity.type === "user" && <UserPlus size={14} />}
                {activity.type === "automation" && <Zap size={14} />}
                {activity.type === "alert" && <AlertCircle size={14} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="truncate text-sm font-medium text-slate-900">
                    {activity.title}
                  </h4>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {activity.timestamp}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                  {activity.description}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
