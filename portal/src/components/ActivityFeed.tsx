import { Bell, Zap, UserPlus, Clock, AlertCircle } from "lucide-react";
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
    <div className="flex h-full flex-col overflow-hidden rounded-[2.5rem] border border-gray-100 bg-white shadow-sm animate-in fade-in duration-700">
      <div className="z-10 flex items-center justify-between border-b border-gray-50 bg-white/50 p-8 backdrop-blur-sm">
        <div>
          <h3 className="text-xl font-bold text-gray-900">
            {ta("notificationHistory", "Notification History")}
          </h3>
          <p className="mt-1 text-sm text-gray-400">
            {ta(
              "notificationHistoryDescription",
              "Live stream of notification delivery and platform events",
            )}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {activities.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {ta("noNotifications", "No recent notifications.")}
          </div>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="group flex items-start gap-4 rounded-3xl border border-transparent p-4 transition-all duration-300 hover:border-gray-100 hover:bg-gray-50"
            >
              <div
                className={clsx(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-transform group-hover:scale-110",
                  activity.status === "success"
                    ? "bg-green-50 text-green-600"
                    : activity.status === "warning"
                      ? "bg-amber-50 text-amber-600"
                      : activity.status === "error"
                        ? "bg-red-50 text-red-600"
                        : "bg-blue-50 text-blue-600",
                )}
              >
                {activity.type === "notification" && <Bell size={18} />}
                {activity.type === "user" && <UserPlus size={18} />}
                {activity.type === "automation" && <Zap size={18} />}
                {activity.type === "alert" && <AlertCircle size={18} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h4 className="truncate text-sm font-bold text-gray-900">{activity.title}</h4>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-gray-400">
                    <Clock size={10} /> {activity.timestamp}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">
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
