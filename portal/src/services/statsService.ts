import { apiRequest } from "./apiClient";

/**
 * Raw stat item returned by the API's dashboard stats endpoint.
 * The API returns an array of { title, value, unit } objects.
 */
export interface ApiStatItem {
  title: string;
  value: string;
  unit: string | null;
}

/**
 * Structured stats object expected by portal UI components.
 */
export interface Stats {
  notifications: {
    total: number;
    thisWeek: number;
    thisMonth: number;
    pending: number;
  };
  delivery: {
    successRate: number;
  };
  resources: {
    devices: number;
    apps: number;
  };
  trend: { date: string; total: number; delivered: number; failed: number }[];
  recentActivity: any[]; // Or properly type as NotificationHistoryItem[] if imported
}

/**
 * Parse the flat API stat items into the structured Stats shape.
 */
function parseStats(items: ApiStatItem[]): Stats {
  const find = (title: string): number => {
    const item = items.find((i) => i.title === title);
    return item ? parseInt(item.value, 10) || 0 : 0;
  };

  return {
    notifications: {
      total: find("Total Notifications"),
      thisWeek: find("Weekly Notifications"),
      thisMonth: find("Monthly Notifications"),
      pending: find("Pending Notifications"),
    },
    delivery: {
      successRate: find("Delivery Rate"),
    },
    resources: {
      devices: find("Active Devices"),
      apps: find("Total Apps"),
    },
    trend: [],
    recentActivity: [],
  };
}

export const statsService = {
  getStats: async (token: string | null): Promise<Stats> => {
    const [dashboardItems, trendItems, notificationsRes] = await Promise.all([
      apiRequest<ApiStatItem[]>("/stats/dashboard", token),
      apiRequest<ApiStatItem[]>("/stats/trend?days=12", token).catch(() => []),
      apiRequest<{ data: any[] }>("/notifications?limit=5", token).catch(() => ({ data: [] })),
    ]);

    const parsed = parseStats(dashboardItems);

    // Group trend items by date
    const trendMap = new Map<string, { total: number; delivered: number; failed: number }>();
    for (const item of trendItems) {
      // item.title looks like "2023-10-27 Total" or "2023-10-27 Delivered"
      const match = item.title.match(/^(\d{4}-\d{2}-\d{2})\s+(Total|Delivered|Failed)$/);
      if (match) {
        const date = match[1]!;
        const type = match[2]!;
        if (!trendMap.has(date)) trendMap.set(date, { total: 0, delivered: 0, failed: 0 });
        const entry = trendMap.get(date)!;
        if (type === "Total") entry.total = parseInt(item.value, 10) || 0;
        if (type === "Delivered") entry.delivered = parseInt(item.value, 10) || 0;
        if (type === "Failed") entry.failed = parseInt(item.value, 10) || 0;
      }
    }

    parsed.trend = Array.from(trendMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    parsed.recentActivity = notificationsRes.data || [];

    return parsed;
  },
};

/* ─────────────────────────  Dashboard overview  ───────────────────────── */

export interface OverviewProvider {
  provider: string;
  attempted: number;
  delivered: number;
  failed: number;
  successRate: number;
}

export interface DashboardOverview {
  scope: { appId: string | null; appCount: number; days: number };
  notifications: {
    total: number;
    pending: number;
    processing: number;
    sent: number;
    delivered: number;
    failed: number;
    cancelled: number;
    inWindow: number;
    inPreviousWindow: number;
    changePct: number | null;
  };
  delivery: {
    attempted: number;
    delivered: number;
    failed: number;
    successRate: number;
    failureRate: number;
  };
  providers: OverviewProvider[];
  failures: { category: string; count: number }[];
  audience: {
    users: number;
    reachableUsers: number;
    reachablePct: number;
    devices: number;
    byPlatform: { platform: string; count: number }[];
  };
  trend: { date: string; total: number; delivered: number; failed: number }[];
  apps: {
    id: string;
    name: string;
    isKilled: boolean;
    iconUrl: string | null;
    notifications: number;
    users: number;
  }[];
  recentActivity: {
    id: string;
    type: string;
    status: string;
    title: string;
    body: string | null;
    createdAt: string;
    app: { id: string; name: string } | null;
  }[];
}

/**
 * Single structured call for the dashboard. Replaces the old approach of
 * fetching three flat `{ title, value }` lists and re-parsing stat names.
 */
export async function getDashboardOverview(
  token: string | null,
  options: { appId?: string | null; days?: number } = {},
): Promise<DashboardOverview> {
  const params = new URLSearchParams();
  if (options.appId) params.set("appId", options.appId);
  params.set("days", String(options.days ?? 14));
  return apiRequest<DashboardOverview>(`/stats/overview?${params}`, token);
}
