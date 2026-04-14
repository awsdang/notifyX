import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { adminService, type AdminRole, type AdminUserRecord } from "../services/adminService";
import { appService } from "../services/appService";
import { useAuth } from "../context/AuthContext";
import type { Application } from "../types";

type DraftState = {
  role: AdminRole;
  isActive: boolean;
  appIds: string[];
};

const emptyCreateState = {
  name: "",
  email: "",
  password: "",
  role: "MARKETING_MANAGER" as AdminRole,
  appIds: [] as string[],
};

export function AdminAccessManager() {
  const { token, user } = useAuth();
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [createState, setCreateState] = useState(emptyCreateState);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of apps) map.set(app.id, app.name);
    return map;
  }, [apps]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminList, appList] = await Promise.all([
        adminService.listAdmins(token),
        appService.getApps(token),
      ]);
      setAdmins(adminList);
      setApps(appList);
      setDrafts(
        Object.fromEntries(
          adminList.map((admin) => [
            admin.id,
            {
              role: admin.role,
              isActive: admin.isActive,
              appIds: [...admin.managedApps],
            },
          ]),
        ),
      );
    } catch (err: any) {
      setError(err?.message || "Failed to load admin access data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const toggleDraftApp = (adminId: string, appId: string) => {
    setDrafts((prev) => {
      const current = prev[adminId];
      if (!current) return prev;
      const exists = current.appIds.includes(appId);
      return {
        ...prev,
        [adminId]: {
          ...current,
          appIds: exists
            ? current.appIds.filter((id) => id !== appId)
            : [...current.appIds, appId],
        },
      };
    });
  };

  const saveAdmin = async (admin: AdminUserRecord) => {
    const draft = drafts[admin.id];
    if (!draft) return;
    setSavingUserId(admin.id);
    setError(null);
    try {
      await adminService.updateAdmin(token, admin.id, {
        role: draft.role,
        isActive: draft.isActive,
      });
      if (draft.role !== "SUPER_ADMIN") {
        await adminService.replaceAdminApps(token, admin.id, draft.appIds);
      }
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update admin user.");
    } finally {
      setSavingUserId(null);
    }
  };

  const toggleCreateApp = (appId: string) => {
    setCreateState((prev) => ({
      ...prev,
      appIds: prev.appIds.includes(appId)
        ? prev.appIds.filter((id) => id !== appId)
        : [...prev.appIds, appId],
    }));
  };

  const createAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await adminService.createAdmin(token, {
        name: createState.name,
        email: createState.email,
        password: createState.password,
        role: createState.role,
      });

      if (createState.role !== "SUPER_ADMIN" && createState.appIds.length > 0) {
        await adminService.replaceAdminApps(token, created.id, createState.appIds);
      }

      setCreateState(emptyCreateState);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to create admin user.");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">Loading admin access...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Create Admin User</h3>
        <p className="mt-1 text-sm text-slate-500">Super admins can create users, set roles, and grant app access.</p>

        <form className="mt-4 space-y-4" onSubmit={createAdmin}>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="Name"
              value={createState.name}
              onChange={(e) => setCreateState((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              type="email"
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="Email"
              value={createState.email}
              onChange={(e) => setCreateState((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
            <input
              type="password"
              className="rounded-lg border px-3 py-2 text-sm"
              placeholder="Temporary Password"
              value={createState.password}
              onChange={(e) => setCreateState((prev) => ({ ...prev, password: e.target.value }))}
              required
              minLength={8}
            />
            <p className="text-xs text-slate-400 -mt-1 md:col-span-2">Minimum 8 characters. The user should change this on first login.</p>
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={createState.role}
              onChange={(e) =>
                setCreateState((prev) => ({
                  ...prev,
                  role: e.target.value as AdminRole,
                  appIds: e.target.value === "SUPER_ADMIN" ? [] : prev.appIds,
                }))
              }
            >
              <option value="MARKETING_MANAGER">Marketing - Campaigns, templates, and audience only</option>
              <option value="APP_MANAGER">App Manager - Manage assigned apps and credentials</option>
              <option value="SUPER_ADMIN">Super Admin - Full access to all apps and settings</option>
            </select>
          </div>

          {createState.role !== "SUPER_ADMIN" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">App Access</p>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {apps.map((app) => (
                  <label key={app.id} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createState.appIds.includes(app.id)}
                      onChange={() => toggleCreateApp(app.id)}
                    />
                    <span className="truncate">{app.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create User"}
          </Button>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">Admin Access</h3>
        {admins.map((admin) => {
          const draft = drafts[admin.id] || {
            role: admin.role,
            isActive: admin.isActive,
            appIds: admin.managedApps,
          };
          const isSelf = user?.id === admin.id;

          return (
            <article key={admin.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{admin.name}</p>
                    <p className="text-sm text-slate-500">{admin.email}</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-slate-500">Role</span>
                      <select
                        className="w-full rounded-lg border px-3 py-2"
                        value={draft.role}
                        disabled={isSelf}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [admin.id]: {
                              ...draft,
                              role: e.target.value as AdminRole,
                              appIds:
                                e.target.value === "SUPER_ADMIN" ? [] : draft.appIds,
                            },
                          }))
                        }
                      >
                        <option value="MARKETING_MANAGER">Marketing - Campaigns, templates, and audience only</option>
                        <option value="APP_MANAGER">App Manager - Manage assigned apps and credentials</option>
                        <option value="SUPER_ADMIN">Super Admin - Full access to all apps and settings</option>
                      </select>
                    </label>

                    <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        disabled={isSelf}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [admin.id]: {
                              ...draft,
                              isActive: e.target.checked,
                            },
                          }))
                        }
                      />
                      Active
                    </label>
                    <p className="text-xs text-slate-400 md:col-span-2">Inactive users cannot log in or access the portal.</p>
                  </div>

                  {draft.role !== "SUPER_ADMIN" && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        App Access ({draft.appIds.length})
                      </p>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {apps.map((app) => (
                          <label key={app.id} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={draft.appIds.includes(app.id)}
                              onChange={() => toggleDraftApp(admin.id, app.id)}
                            />
                            <span className="truncate">{app.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {admin.managedApps.length > 0 && (
                    <p className="text-xs text-slate-500">
                      Current apps: {admin.managedApps.map((id) => appNameById.get(id) || id).join(", ")}
                    </p>
                  )}
                </div>

                <div className="flex items-start">
                  <Button
                    onClick={() => void saveAdmin(admin)}
                    disabled={savingUserId === admin.id}
                  >
                    {savingUserId === admin.id ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
