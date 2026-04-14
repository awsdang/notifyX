import {
  Bell,
  LayoutDashboard,
  Users,
  Send,
  FileText,
  Settings,
  Key,
  LogOut,
  FlaskConical,
  Megaphone,
  Zap,
  Terminal,
  Lock,
  History,
  Shield,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOnboarding } from "../hooks/useOnboarding";
import { useAppContext } from "../context/AppContext";
import { useScopedTranslation } from "../context/I18nContext";
import { clsx } from "clsx";
import type { ReactNode } from "react";

function SidebarSection({ label }: { label: string }) {
  return (
    <p className="mb-1 mt-5 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
      {label}
    </p>
  );
}

function SidebarNavItem({
  to,
  icon,
  children,
  disabled,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) {
  const location = useLocation();
  const isActive =
    location.pathname === to || location.pathname.startsWith(to + "/");

  if (disabled) {
    return (
      <span className="flex cursor-not-allowed items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-400">
        {icon}
        {children}
      </span>
    );
  }

  return (
    <NavLink
      to={to}
      className={clsx(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all",
        isActive
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      {icon}
      {children}
    </NavLink>
  );
}

export function Sidebar() {
  const { user, logout, canManageCredentials } = useAuth();
  const onboarding = useOnboarding();
  const { apps } = useAppContext();
  const ts = useScopedTranslation("components", "Sidebar");
  const tc = useScopedTranslation("components", "common");

  const isMarketingManager = user?.role === "MARKETING_MANAGER";
  const canManageAdminUsers = user?.role === "SUPER_ADMIN";
  const hasApps = apps.length > 0;
  const locked = !onboarding.isOnboarded && !isMarketingManager;

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-e border-slate-100 bg-white px-3 py-4">
      <div className="mb-6 flex items-center gap-2.5 px-3 pt-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700">
          <Bell className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold text-slate-900">NotifyX</span>
      </div>

      {locked && (
        <div className="mx-2 mb-3 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2.5">
          <div className="mb-1 flex items-center gap-2">
            <Lock size={12} className="text-amber-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              {ts("setupRequired", "Setup Required")}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-600">
            {ts(
              "setupRequiredDescription",
              "Create an app and configure credentials to unlock all features.",
            )}
          </p>
        </div>
      )}

      <nav className="flex-1 space-y-0.5">
        <SidebarNavItem
          to={locked ? "/onboarding" : "/dashboard"}
          icon={<LayoutDashboard size={16} />}
        >
          {locked
            ? ts("tabGettingStarted", "Getting Started")
            : ts("tabDashboard", "Dashboard")}
        </SidebarNavItem>

        {!isMarketingManager && (
          <>
            <SidebarSection label="Workspace" />
            <SidebarNavItem to="/apps" icon={<Settings size={16} />}>
              {ts("tabManageApps", "Apps")}
            </SidebarNavItem>
            {canManageCredentials && (
              <SidebarNavItem to="/credentials" icon={<Key size={16} />}>
                {ts("tabCredentials", "Credentials")}
              </SidebarNavItem>
            )}
            {canManageAdminUsers && (
              <SidebarNavItem to="/admin-access" icon={<Shield size={16} />}>
                {ts("tabAdminAccess", "Team")}
              </SidebarNavItem>
            )}
          </>
        )}

        <SidebarSection label="Messaging" />
        {!isMarketingManager && (
          <SidebarNavItem
            to="/send"
            icon={<Send size={16} />}
            disabled={locked || !hasApps}
          >
            {ts("tabSendNotification", "Send")}
          </SidebarNavItem>
        )}
        <SidebarNavItem
          to="/campaigns"
          icon={<Megaphone size={16} />}
          disabled={locked}
        >
          {ts("tabCampaigns", "Campaigns")}
        </SidebarNavItem>
        <SidebarNavItem
          to="/templates"
          icon={<FileText size={16} />}
          disabled={locked}
        >
          {ts("tabTemplates", "Templates")}
        </SidebarNavItem>
        <SidebarNavItem
          to="/ab-tests"
          icon={<FlaskConical size={16} />}
          disabled={locked}
        >
          {ts("tabAbTesting", "A/B Tests")}
        </SidebarNavItem>

        <SidebarSection label="Audience" />
        <SidebarNavItem
          to="/users"
          icon={<Users size={16} />}
          disabled={locked}
        >
          {ts("tabUsersDevices", "Users & Devices")}
        </SidebarNavItem>
        {!isMarketingManager && (
          <SidebarNavItem
            to="/history"
            icon={<History size={16} />}
            disabled={locked || !hasApps}
          >
            {ts("tabHistory", "History")}
          </SidebarNavItem>
        )}

        {!isMarketingManager && (
          <>
            <SidebarSection label="Developer" />
            <SidebarNavItem
              to="/automation"
              icon={<Zap size={16} />}
              disabled={locked}
            >
              {ts("tabAutomation", "Automation")}
            </SidebarNavItem>
            <SidebarNavItem
              to="/devx"
              icon={<Terminal size={16} />}
              disabled={locked}
            >
              {ts("tabDevx", "SDKs")}
            </SidebarNavItem>
            <SidebarNavItem
              to="/simulator"
              icon={<FlaskConical size={16} />}
              disabled={locked}
            >
              {ts("tabSimulator", "Simulator")}
            </SidebarNavItem>
          </>
        )}
      </nav>

      <div className="mt-auto border-t border-slate-100 pt-3">
        <div className="flex items-center gap-2.5 rounded-xl px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
            {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-800">
              {user?.name || user?.email || tc("unknownUser", "Unknown")}
            </p>
            <p className="text-[11px] text-slate-400">
              {(user?.role || "").replace(/_/g, " ")}
            </p>
          </div>
          <button
            onClick={logout}
            title={ts("signOut", "Sign Out")}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
