import { apiRequest } from "./apiClient";

export type AdminRole = "SUPER_ADMIN" | "APP_MANAGER" | "MARKETING_MANAGER";

export interface ManagedAppSummary {
  id: string;
  name: string;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  managedApps: string[];
  managedAppDetails: ManagedAppSummary[];
}

export const adminService = {
  listAdmins: (token: string | null): Promise<AdminUserRecord[]> =>
    apiRequest("/admin/users?limit=200", token),

  createAdmin: (
    token: string | null,
    data: {
      email: string;
      name: string;
      password: string;
      role: AdminRole;
    },
  ): Promise<AdminUserRecord> =>
    apiRequest("/admin/users", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateAdmin: (
    token: string | null,
    id: string,
    data: {
      role?: AdminRole;
      isActive?: boolean;
    },
  ): Promise<AdminUserRecord> =>
    apiRequest(`/admin/users/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  replaceAdminApps: (
    token: string | null,
    id: string,
    appIds: string[],
  ): Promise<AdminUserRecord> =>
    apiRequest(`/admin/users/${id}/apps`, token, {
      method: "PUT",
      body: JSON.stringify({ appIds }),
    }),
};
