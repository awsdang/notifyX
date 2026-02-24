import { apiRequest } from "./apiClient";
import type { Application, Campaign, NotificationHistoryItem } from "../types";

export interface AppStats {
  notifications: number;
  users: number;
  templates: number;
}

export interface AppCollaborator {
  assignmentId: string;
  appId: string;
  adminUserId: string;
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "APP_MANAGER" | "MARKETING_MANAGER";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AppInvite {
  id: string;
  email: string;
  role: "APP_MANAGER" | "MARKETING_MANAGER";
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string | null;
  createdAt: string;
  invitedByAdminUser?: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export interface AppAccessResponse {
  members: AppCollaborator[];
  invites: AppInvite[];
}

export const appService = {
  getApps: (token: string | null): Promise<Application[]> =>
    apiRequest("/apps", token),

  getApp: (id: string, token: string | null): Promise<Application> =>
    apiRequest(`/apps/${id}`, token),

  createApp: (name: string, token: string | null) =>
    apiRequest("/apps", token, {
      method: "POST",
      body: JSON.stringify({
        name,
        platforms: {
          android: true,
          ios: true,
          web: true,
          huawei: true,
        },
      }),
    }),

  updateApp: (
    id: string,
    data: { name?: string },
    token: string | null,
  ): Promise<Application> =>
    apiRequest(`/apps/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  killApp: (id: string, token: string | null): Promise<{ app: Application }> =>
    apiRequest(`/apps/${id}/kill`, token, { method: "POST" }),

  reviveApp: (id: string, token: string | null): Promise<Application> =>
    apiRequest(`/apps/${id}/revive`, token, { method: "POST" }),

  /**
   * Fetch per-app stats from /stats/apps and extract counts for a specific app.
   */
  getAppStats: async (
    _appId: string,
    appName: string,
    token: string | null,
  ): Promise<AppStats> => {
    const items = await apiRequest<{ title: string; value: string }[]>(
      "/stats/apps",
      token,
    );
    const find = (suffix: string): number => {
      const item = items.find((i) => i.title === `${appName} ${suffix}`);
      return item ? parseInt(item.value, 10) || 0 : 0;
    };
    return {
      notifications: find("Notifications"),
      users: find("Users"),
      templates: find("Templates"),
    };
  },

  /**
   * Fetch campaigns filtered by appId.
   */
  getAppCampaigns: (
    appId: string,
    token: string | null,
  ): Promise<Campaign[]> =>
    apiRequest(`/campaigns?appId=${appId}`, token),

  getAppNotifications: (
    appId: string,
    token: string | null,
    limit = 25,
  ): Promise<NotificationHistoryItem[]> =>
    apiRequest(`/notifications?appId=${appId}&limit=${limit}`, token),

  getAppAccess: (appId: string, token: string | null): Promise<AppAccessResponse> =>
    apiRequest(`/apps/${appId}/access`, token),

  inviteAppAccess: (
    appId: string,
    data: { email: string; role: "APP_MANAGER" | "MARKETING_MANAGER" },
    token: string | null,
  ): Promise<{
    kind: "INVITED" | "ASSIGNED";
    invite?: AppInvite;
    member?: AppCollaborator;
  }> =>
    apiRequest(`/apps/${appId}/invites`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  revokeAppInvite: (appId: string, inviteId: string, token: string | null) =>
    apiRequest(`/apps/${appId}/invites/${inviteId}`, token, {
      method: "DELETE",
    }),
};
