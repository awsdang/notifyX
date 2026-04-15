import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/Card";
import { Input, Select } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { SkeletonTable } from "./ui/Skeleton";
import {
  adminService,
  type AdminRole,
  type AdminUserRecord,
} from "../services/adminService";
import { appService } from "../services/appService";
import { useAuth } from "../context/AuthContext";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import type { Application } from "../types";
import {
  UserPlus,
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldCheck,
  UserCheck,
  MoreHorizontal,
  X,
  Pencil,
  KeyRound,
  AppWindow,
  UserMinus,
  Trash2,
} from "lucide-react";
import { clsx } from "clsx";

/* ─── Constants ─── */

type DraftState = {
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  appIds: string[];
};

const EMPTY_CREATE = {
  name: "",
  email: "",
  password: "",
  role: "MARKETING_MANAGER" as AdminRole,
  appIds: [] as string[],
};

const PAGE_SIZE = 10;

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: "MARKETING_MANAGER", label: "Marketing" },
  { value: "APP_MANAGER", label: "App Manager" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  MARKETING_MANAGER: "Campaigns, templates & audience",
  APP_MANAGER: "Manage assigned apps & credentials",
  SUPER_ADMIN: "Full access to all apps & settings",
};

const ROLE_BADGE_VARIANT: Record<AdminRole, "error" | "info" | "success"> = {
  SUPER_ADMIN: "error",
  APP_MANAGER: "info",
  MARKETING_MANAGER: "success",
};

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  APP_MANAGER: "App Manager",
  MARKETING_MANAGER: "Marketing",
};

/* ─── Helpers ─── */

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-pink-500",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── SlideOver component ─── */

function SlideOver({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 transition-opacity"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ─── Toggle Switch ─── */

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2",
        checked ? "bg-blue-600" : "bg-slate-200",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={clsx(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

/* ─── Actions Dropdown ─── */

function ActionsDropdown({
  admin,
  isSelf,
  onEdit,
  onChangeRole,
  onManageApps,
  onToggleStatus,
  onDelete,
}: {
  admin: AdminUserRecord;
  isSelf: boolean;
  onEdit: () => void;
  onChangeRole: () => void;
  onManageApps: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }[] = [
    {
      icon: <Pencil className="h-4 w-4" />,
      label: "Edit Details",
      onClick: onEdit,
    },
    {
      icon: <KeyRound className="h-4 w-4" />,
      label: "Change Role",
      onClick: onChangeRole,
      disabled: isSelf,
    },
    {
      icon: <AppWindow className="h-4 w-4" />,
      label: "Manage App Access",
      onClick: onManageApps,
      disabled: admin.role === "SUPER_ADMIN",
    },
    {
      icon: <UserMinus className="h-4 w-4" />,
      label: admin.isActive ? "Deactivate" : "Activate",
      onClick: onToggleStatus,
      disabled: isSelf,
    },
    {
      icon: <Trash2 className="h-4 w-4" />,
      label: "Delete",
      onClick: onDelete,
      destructive: true,
      disabled: isSelf,
    },
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={clsx(
                "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-slate-300"
                  : item.destructive
                    ? "text-rose-600 hover:bg-rose-50"
                    : "text-slate-700 hover:bg-slate-50",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */

export function AdminAccessManager() {
  const { token, user } = useAuth();
  const { confirm } = useConfirmDialog();
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // Slide-over states
  const [createOpen, setCreateOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState<AdminUserRecord | null>(null);
  const [editDraft, setEditDraft] = useState<DraftState | null>(null);

  // Create form
  const [createState, setCreateState] = useState(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ── Derived data ── */

  const filteredAdmins = useMemo(() => {
    if (!searchQuery.trim()) return admins;
    const q = searchQuery.toLowerCase();
    return admins.filter(
      (a) =>
        a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
    );
  }, [admins, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredAdmins.length / PAGE_SIZE));
  const paginatedAdmins = filteredAdmins.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const stats = useMemo(() => {
    const total = admins.length;
    const active = admins.filter((a) => a.isActive).length;
    const byRole: Record<AdminRole, number> = {
      SUPER_ADMIN: 0,
      APP_MANAGER: 0,
      MARKETING_MANAGER: 0,
    };
    for (const a of admins) byRole[a.role]++;
    return { total, active, byRole };
  }, [admins]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  /* ── Load ── */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminList, appList] = await Promise.all([
        adminService.listAdmins(token),
        appService.getApps(token),
      ]);
      setAdmins(adminList);
      setApps(appList);
    } catch (err: any) {
      setError(err?.message || "Failed to load admin access data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── Create ── */

  const toggleCreateApp = (appId: string) => {
    setCreateState((prev) => ({
      ...prev,
      appIds: prev.appIds.includes(appId)
        ? prev.appIds.filter((id) => id !== appId)
        : [...prev.appIds, appId],
    }));
  };

  const handleCreate = async (e: FormEvent) => {
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
        await adminService.replaceAdminApps(
          token,
          created.id,
          createState.appIds,
        );
      }
      setCreateState(EMPTY_CREATE);
      setCreateOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to create admin user.");
    } finally {
      setCreating(false);
    }
  };

  /* ── Edit ── */

  const openEdit = (admin: AdminUserRecord) => {
    setEditAdmin(admin);
    setEditDraft({
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
      appIds: [...admin.managedApps],
    });
  };

  const handleSaveEdit = async () => {
    if (!editAdmin || !editDraft) return;
    setSaving(true);
    setError(null);
    try {
      await adminService.updateAdmin(token, editAdmin.id, {
        role: editDraft.role,
        isActive: editDraft.isActive,
      });
      if (editDraft.role !== "SUPER_ADMIN") {
        await adminService.replaceAdminApps(
          token,
          editAdmin.id,
          editDraft.appIds,
        );
      }
      setEditAdmin(null);
      setEditDraft(null);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update admin user.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEditApp = (appId: string) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      const exists = prev.appIds.includes(appId);
      return {
        ...prev,
        appIds: exists
          ? prev.appIds.filter((id) => id !== appId)
          : [...prev.appIds, appId],
      };
    });
  };

  /* ── Actions ── */

  const handleToggleStatus = async (admin: AdminUserRecord) => {
    const confirmed = await confirm({
      title: `${admin.isActive ? "Deactivate" : "Activate"} ${admin.name}?`,
      description: admin.isActive
        ? "This user will no longer be able to log in or access the platform."
        : "This user will regain access to the platform.",
      confirmText: admin.isActive ? "Deactivate" : "Activate",
      destructive: admin.isActive,
    });
    if (!confirmed) return;
    setError(null);
    try {
      await adminService.updateAdmin(token, admin.id, {
        isActive: !admin.isActive,
      });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update user status.");
    }
  };

  const handleDelete = async (admin: AdminUserRecord) => {
    const confirmed = await confirm({
      title: `Delete ${admin.name}?`,
      description:
        "This action is permanent and cannot be undone. The user will lose all access immediately.",
      confirmText: "Delete User",
      destructive: true,
    });
    if (!confirmed) return;
    setError(null);
    try {
      await adminService.updateAdmin(token, admin.id, { isActive: false });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to delete user.");
    }
  };

  /* ── Render ── */

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

      {/* ── Stats Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Users className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">Total Users</p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {stats.active}
              </p>
              <p className="text-xs text-slate-500">Active Users</p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
              <Shield className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {stats.byRole.SUPER_ADMIN}
              </p>
              <p className="text-xs text-slate-500">Super Admins</p>
            </div>
          </div>
        </Card>
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {stats.byRole.APP_MANAGER + stats.byRole.MARKETING_MANAGER}
              </p>
              <p className="text-xs text-slate-500">Team Members</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Header + Search + Invite ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 ps-9 pe-3.5 text-sm shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Team Member
        </Button>
      </div>

      {/* ── Data Table ── */}
      {paginatedAdmins.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={searchQuery ? "No matching users" : "No team members yet"}
          description={
            searchQuery
              ? "Try a different search term."
              : "Invite your first team member to get started."
          }
          action={
            !searchQuery
              ? {
                  label: "Invite Team Member",
                  onClick: () => setCreateOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <Card padding="sm" className="overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">
                    User
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">
                    Status
                  </th>
                  <th className="hidden px-4 py-3 text-left font-medium text-slate-500 md:table-cell">
                    Last Login
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedAdmins.map((admin) => {
                  const isSelf = user?.id === admin.id;
                  return (
                    <tr
                      key={admin.id}
                      className="transition-colors hover:bg-slate-50/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={clsx(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                              avatarColor(admin.id),
                            )}
                          >
                            {getInitials(admin.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">
                              {admin.name}
                              {isSelf && (
                                <span className="ml-1.5 text-xs font-normal text-slate-400">
                                  (you)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {admin.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ROLE_BADGE_VARIANT[admin.role]}>
                          {ROLE_LABEL[admin.role]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={admin.isActive ? "success" : "default"}
                          dot
                        >
                          {admin.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                        {formatDate(admin.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ActionsDropdown
                          admin={admin}
                          isSelf={isSelf}
                          onEdit={() => openEdit(admin)}
                          onChangeRole={() => openEdit(admin)}
                          onManageApps={() => openEdit(admin)}
                          onToggleStatus={() =>
                            void handleToggleStatus(admin)
                          }
                          onDelete={() => void handleDelete(admin)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/60 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-slate-500">
            Showing{" "}
            <span className="font-medium text-slate-700">
              {(page - 1) * PAGE_SIZE + 1}
            </span>
            {" - "}
            <span className="font-medium text-slate-700">
              {Math.min(page * PAGE_SIZE, filteredAdmins.length)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-slate-700">
              {filteredAdmins.length}
            </span>{" "}
            users
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

      {/* ── Create Slide-Over ── */}
      <SlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Invite Team Member"
      >
        <form className="space-y-5" onSubmit={handleCreate}>
          <Input
            label="Full Name"
            placeholder="Jane Smith"
            value={createState.name}
            onChange={(e) =>
              setCreateState((prev) => ({ ...prev, name: e.target.value }))
            }
            required
          />
          <Input
            label="Email Address"
            type="email"
            placeholder="jane@company.com"
            value={createState.email}
            onChange={(e) =>
              setCreateState((prev) => ({ ...prev, email: e.target.value }))
            }
            required
          />
          <Input
            label="Temporary Password"
            type="password"
            placeholder="Min 8 characters"
            value={createState.password}
            onChange={(e) =>
              setCreateState((prev) => ({
                ...prev,
                password: e.target.value,
              }))
            }
            required
            minLength={8}
            hint="The user should change this on first login."
          />
          <Select
            label="Role"
            value={createState.role}
            onChange={(e) =>
              setCreateState((prev) => ({
                ...prev,
                role: e.target.value as AdminRole,
                appIds:
                  e.target.value === "SUPER_ADMIN" ? [] : prev.appIds,
              }))
            }
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-slate-500">
            {ROLE_DESCRIPTIONS[createState.role]}
          </p>

          {createState.role !== "SUPER_ADMIN" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">App Access</p>
              <div className="space-y-2">
                {apps.map((app) => (
                  <label
                    key={app.id}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50 cursor-pointer"
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
                {apps.length === 0 && (
                  <p className="text-xs text-slate-400">No apps available.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 border-t border-slate-100 pt-5">
            <Button type="submit" disabled={creating} className="flex-1">
              {creating ? "Creating..." : "Invite User"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SlideOver>

      {/* ── Edit Slide-Over ── */}
      <SlideOver
        open={!!editAdmin}
        onClose={() => {
          setEditAdmin(null);
          setEditDraft(null);
        }}
        title={editAdmin ? `Edit ${editAdmin.name}` : "Edit User"}
      >
        {editAdmin && editDraft && (
          <div className="space-y-5">
            {/* Avatar + Info */}
            <div className="flex items-center gap-3">
              <div
                className={clsx(
                  "flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white",
                  avatarColor(editAdmin.id),
                )}
              >
                {getInitials(editAdmin.name)}
              </div>
              <div>
                <p className="font-medium text-slate-900">{editAdmin.name}</p>
                <p className="text-sm text-slate-500">{editAdmin.email}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <Select
                label="Role"
                value={editDraft.role}
                disabled={user?.id === editAdmin.id}
                onChange={(e) =>
                  setEditDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          role: e.target.value as AdminRole,
                          appIds:
                            e.target.value === "SUPER_ADMIN"
                              ? []
                              : prev.appIds,
                        }
                      : prev,
                  )
                }
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                {ROLE_DESCRIPTIONS[editDraft.role]}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Account Status
                </p>
                <p className="text-xs text-slate-500">
                  {editDraft.isActive
                    ? "User can log in and access the platform"
                    : "User is blocked from logging in"}
                </p>
              </div>
              <ToggleSwitch
                checked={editDraft.isActive}
                disabled={user?.id === editAdmin.id}
                onChange={(v) =>
                  setEditDraft((prev) =>
                    prev ? { ...prev, isActive: v } : prev,
                  )
                }
              />
            </div>

            {editDraft.role !== "SUPER_ADMIN" && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-sm font-medium text-slate-700">
                  App Access ({editDraft.appIds.length})
                </p>
                <div className="space-y-2">
                  {apps.map((app) => (
                    <label
                      key={app.id}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={editDraft.appIds.includes(app.id)}
                        onChange={() => toggleEditApp(app.id)}
                        className="rounded"
                      />
                      <span className="truncate">{app.name}</span>
                    </label>
                  ))}
                  {apps.length === 0 && (
                    <p className="text-xs text-slate-400">
                      No apps available.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 border-t border-slate-100 pt-5">
              <Button
                onClick={() => void handleSaveEdit()}
                disabled={saving}
                className="flex-1"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditAdmin(null);
                  setEditDraft(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
