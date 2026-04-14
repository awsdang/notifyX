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
      <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 opacity-40">
        {icon}
        {children}
      </span>
    );
  }

  return (
    <NavLink
      to={to}
      className={clsx(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
        isActive
          ? "bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 shadow-sm"
          : "text-gray-600 hover:bg-gray-50",
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
    <aside className="flex w-64 shrink-0 flex-col items-stretch gap-2 overflow-y-auto border-e border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-3 px-3 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg shadow-blue-200">
          <Bell className="h-6 w-6 text-white" />
        </div>
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-xl font-black tracking-tight text-transparent">
          NotifyX
        </h1>
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

      <nav className="flex-1 space-y-1">
        <SidebarNavItem
          to={locked ? "/onboarding" : "/dashboard"}
          icon={<LayoutDashboard size={20} />}
        >
          {locked
            ? ts("tabGettingStarted", "Getting Started")
            : ts("tabDashboard", "Dashboard")}
        </SidebarNavItem>

        {!isMarketingManager && (
          <SidebarNavItem to="/apps" icon={<Settings size={20} />}>
            {ts("tabManageApps", "Manage Apps")}
          </SidebarNavItem>
        )}

        {canManageCredentials && !isMarketingManager && (
          <SidebarNavItem to="/credentials" icon={<Key size={20} />}>
            {ts("tabCredentials", "Credentials")}
          </SidebarNavItem>
        )}

        {canManageAdminUsers && (
          <SidebarNavItem to="/admin-access" icon={<Shield size={20} />}>
            {ts("tabAdminAccess", "Admin Access")}
          </SidebarNavItem>
        )}

        {!isMarketingManager && (
          <SidebarNavItem
            to="/send"
            icon={<Send size={20} />}
            disabled={locked || !hasApps}
          >
            {ts("tabSendNotification", "Send Notification")}
          </SidebarNavItem>
        )}

        {!isMarketingManager && (
          <SidebarNavItem
            to="/history"
            icon={<History size={20} />}
            disabled={locked || !hasApps}
          >
            {ts("tabHistory", "Notification History")}
          </SidebarNavItem>
        )}

        <SidebarNavItem
          to="/campaigns"
          icon={<Megaphone size={20} />}
          disabled={locked}
        >
          {ts("tabCampaigns", "Campaigns")}
        </SidebarNavItem>

        <SidebarNavItem
          to="/ab-tests"
          icon={<FlaskConical size={20} />}
          disabled={locked}
        >
          {ts("tabAbTesting", "A/B Testing")}
        </SidebarNavItem>

        <SidebarNavItem
          to="/templates"
          icon={<FileText size={20} />}
          disabled={locked}
        >
          {ts("tabTemplates", "Templates")}
        </SidebarNavItem>

        <SidebarNavItem
          to="/users"
          icon={<Users size={20} />}
          disabled={locked}
        >
          {ts("tabUsersDevices", "Users & Devices")}
        </SidebarNavItem>

        {!isMarketingManager && (
          <SidebarNavItem
            to="/automation"
            icon={<Zap size={20} />}
            disabled={locked}
          >
            {ts("tabAutomation", "Automation")}
          </SidebarNavItem>
        )}

        {!isMarketingManager && (
          <SidebarNavItem
            to="/devx"
            icon={<Terminal size={20} />}
            disabled={locked}
          >
            {ts("tabDevx", "DevX & SDKs")}
          </SidebarNavItem>
        )}

        {!isMarketingManager && (
          <SidebarNavItem
            to="/simulator"
            icon={<FlaskConical size={20} />}
            disabled={locked}
          >
            {ts("tabSimulator", "Simulator")}
          </SidebarNavItem>
        )}
      </nav>

      <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {ts("signedIn", "Signed in")}
          </p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {user?.name || user?.email || tc("unknownUser", "Unknown User")}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-indigo-600">
            {(user?.role || tc("unknownRole", "unknown")).replace(/_/g, " ")}
          </p>
        </div>

        <div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-all hover:bg-red-50"
          >
            <LogOut size={20} />
            {ts("signOut", "Sign Out")}
          </button>
        </div>
      </div>
    </aside>
  );
}
