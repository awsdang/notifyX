import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle } from "./ui/Card";
import { Input, Select } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { SkeletonTable } from "./ui/Skeleton";
import { adminService, type AdminRole, type AdminUserRecord } from "../services/adminService";
import { appService } from "../services/appService";
import { useAuth } from "../context/AuthContext";
import type { Application } from "../types";
import {
  UserPlus,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
} from "lucide-react";

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

const PAGE_SIZE = 10;

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: "MARKETING_MANAGER", label: "Marketing — Campaigns, templates & audience" },
  { value: "APP_MANAGER", label: "App Manager — Manage assigned apps & credentials" },
  { value: "SUPER_ADMIN", label: "Super Admin — Full access to all apps & settings" },
];

const ROLE_BADGE_VARIANT: Record<AdminRole, "error" | "info" | "default"> = {
  SUPER_ADMIN: "error",
  APP_MANAGER: "info",
  MARKETING_MANAGER: "default",
};

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  APP_MANAGER: "App Manager",
  MARKETING_MANAGER: "Marketing",
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
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const appNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of apps) map.set(app.id, app.name);
    return map;
  }, [apps]);

  const filteredAdmins = useMemo(() => {
    if (!searchQuery.trim()) return admins;
    const q = searchQuery.toLowerCase();
    return admins.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q),
    );
  }, [admins, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredAdmins.length / PAGE_SIZE));
  const paginatedAdmins = filteredAdmins.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

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
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
        <SkeletonTable rows={4} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      {error && (
        <Card padding="sm" className="border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">{error}</p>
        </Card>
      )}

      {/* ── Create Admin ── */}
      <Card>
        <CardHeader>
          <CardTitle icon={<UserPlus className="h-5 w-5 text-blue-600" />}>
            Create Admin User
          </CardTitle>
        </CardHeader>
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          Super admins can create users, set roles, and grant app access.
        </p>

        <form className="space-y-4" onSubmit={createAdmin}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Name"
              value={createState.name}
              onChange={(e) => setCreateState((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <Input
              type="email"
              placeholder="Email"
              value={createState.email}
              onChange={(e) => setCreateState((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
            <Input
              type="password"
              placeholder="Temporary Password"
              value={createState.password}
              onChange={(e) => setCreateState((prev) => ({ ...prev, password: e.target.value }))}
              required
              minLength={8}
              hint="Minimum 8 characters. The user should change this on first login."
            />
            <Select
              value={createState.role}
              onChange={(e) =>
                setCreateState((prev) => ({
                  ...prev,
                  role: e.target.value as AdminRole,
                  appIds: e.target.value === "SUPER_ADMIN" ? [] : prev.appIds,
                }))
              }
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {createState.role !== "SUPER_ADMIN" && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                App Access
              </p>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {apps.map((app) => (
                  <label
                    key={app.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={createState.appIds.includes(app.id)}
                      onChange={() => toggleCreateApp(app.id)}
                      className="rounded"
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
      </Card>

      {/* ── Admin List ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Shield className="h-5 w-5 text-slate-400" />
            Admin Access
          </h3>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {filteredAdmins.length} {filteredAdmins.length === 1 ? "user" : "users"}
          </span>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 ps-9 pe-3.5 text-sm shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {paginatedAdmins.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={searchQuery ? "No matching admins" : "No admin users yet"}
            description={
              searchQuery
                ? "Try a different search term."
                : "Create your first admin user above to get started."
            }
          />
        ) : (
          <div className="space-y-3">
            {paginatedAdmins.map((admin) => {
              const draft = drafts[admin.id] || {
                role: admin.role,
                isActive: admin.isActive,
                appIds: admin.managedApps,
              };
              const isSelf = user?.id === admin.id;

              return (
                <Card key={admin.id} padding="md">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold text-slate-900">
                              {admin.name}
                            </p>
                            <Badge variant={ROLE_BADGE_VARIANT[admin.role]}>
                              {ROLE_LABEL[admin.role]}
                            </Badge>
                            {!admin.isActive && (
                              <Badge variant="default">Inactive</Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">{admin.email}</p>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <Select
                          label="Role"
                          value={draft.role}
                          disabled={isSelf}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [admin.id]: {
                                ...draft,
                                role: e.target.value as AdminRole,
                                appIds:
                                  e.target.value === "SUPER_ADMIN"
                                    ? []
                                    : draft.appIds,
                              },
                            }))
                          }
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>

                        <label className="flex items-center gap-2 pt-7 text-sm text-slate-700">
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
                            className="rounded"
                          />
                          Active
                          <span className="text-xs text-slate-400">
                            — Inactive users cannot log in
                          </span>
                        </label>
                      </div>

                      {draft.role !== "SUPER_ADMIN" && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            App Access ({draft.appIds.length})
                          </p>
                          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {apps.map((app) => (
                              <label
                                key={app.id}
                                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={draft.appIds.includes(app.id)}
                                  onChange={() =>
                                    toggleDraftApp(admin.id, app.id)
                                  }
                                  className="rounded"
                                />
                                <span className="truncate">{app.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {admin.managedApps.length > 0 && (
                        <p className="text-xs text-slate-500">
                          Current apps:{" "}
                          {admin.managedApps
                            .map((id) => appNameById.get(id) || id)
                            .join(", ")}
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
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-2xl border bg-white px-4 py-3">
            <p className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
