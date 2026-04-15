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
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOnboarding } from "../hooks/useOnboarding";
import { useAppContext } from "../context/AppContext";
import { useScopedTranslation } from "../context/I18nContext";
import { clsx } from "clsx";
import { type ReactNode } from "react";

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobile?: boolean;
  onClose?: () => void;
}

function SidebarSection({
  label,
  collapsed,
}: {
  label: string;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return <div className="mx-auto my-3 h-px w-6 bg-slate-200" />;
  }
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
  collapsed,
  onNavigate,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const isActive =
    location.pathname === to || location.pathname.startsWith(to + "/");

  if (disabled) {
    return (
      <span
        className={clsx(
          "flex cursor-not-allowed items-center rounded-xl text-[13px] font-medium text-slate-400",
          collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2",
        )}
        title={collapsed ? String(children) : undefined}
      >
        {icon}
        {!collapsed && children}
      </span>
    );
  }

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={clsx(
        "flex items-center rounded-xl text-[13px] font-medium transition-all",
        collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2",
        isActive
          ? "bg-indigo-50 text-indigo-700"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
      )}
      title={collapsed ? String(children) : undefined}
    >
      {icon}
      {!collapsed && children}
    </NavLink>
  );
}

export function Sidebar({
  collapsed = false,
  onToggleCollapse,
  mobile = false,
  onClose,
}: SidebarProps) {
  const { user, logout, canManageCredentials } = useAuth();
  const onboarding = useOnboarding();
  const { apps } = useAppContext();
  const ts = useScopedTranslation("components", "Sidebar");
  const tc = useScopedTranslation("components", "common");

  const isMarketingManager = user?.role === "MARKETING_MANAGER";
  const canManageAdminUsers = user?.role === "SUPER_ADMIN";
  const hasApps = apps.length > 0;
  const locked = !onboarding.isOnboarded && !isMarketingManager;

  const handleNavigate = mobile ? onClose : undefined;

  return (
    <aside
      className={clsx(
        "flex shrink-0 flex-col overflow-y-auto border-e border-slate-100 bg-white transition-all duration-300",
        collapsed ? "w-[68px] px-2 py-4" : "w-60 px-3 py-4",
      )}
    >
      {/* Header */}
      <div
        className={clsx(
          "mb-6 flex items-center pt-2",
          collapsed ? "justify-center px-0" : "gap-2.5 px-3",
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
          <Bell className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-slate-900">NotifyX</span>
        )}
        {mobile && onClose && (
          <button
            onClick={onClose}
            className="ms-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Setup Warning */}
      {locked && !collapsed && (
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
          collapsed={collapsed}
          onNavigate={handleNavigate}
        >
          {locked
            ? ts("tabGettingStarted", "Getting Started")
            : ts("tabDashboard", "Dashboard")}
        </SidebarNavItem>

        {!isMarketingManager && (
          <>
            <SidebarSection label="Workspace" collapsed={collapsed} />
            <SidebarNavItem
              to="/apps"
              icon={<Settings size={16} />}
              collapsed={collapsed}
              onNavigate={handleNavigate}
            >
              {ts("tabManageApps", "Apps")}
            </SidebarNavItem>
            {canManageCredentials && (
              <SidebarNavItem
                to="/credentials"
                icon={<Key size={16} />}
                collapsed={collapsed}
                onNavigate={handleNavigate}
              >
                {ts("tabCredentials", "Credentials")}
              </SidebarNavItem>
            )}
            {canManageAdminUsers && (
              <SidebarNavItem
                to="/admin-access"
                icon={<Shield size={16} />}
                collapsed={collapsed}
                onNavigate={handleNavigate}
              >
                {ts("tabAdminAccess", "Team")}
              </SidebarNavItem>
            )}
          </>
        )}

        <SidebarSection label="Messaging" collapsed={collapsed} />
        {!isMarketingManager && (
          <SidebarNavItem
            to="/send"
            icon={<Send size={16} />}
            disabled={locked || !hasApps}
            collapsed={collapsed}
            onNavigate={handleNavigate}
          >
            {ts("tabSendNotification", "Send")}
          </SidebarNavItem>
        )}
        <SidebarNavItem
          to="/campaigns"
          icon={<Megaphone size={16} />}
          disabled={locked}
          collapsed={collapsed}
          onNavigate={handleNavigate}
        >
          {ts("tabCampaigns", "Campaigns")}
        </SidebarNavItem>
        <SidebarNavItem
          to="/templates"
          icon={<FileText size={16} />}
          disabled={locked}
          collapsed={collapsed}
          onNavigate={handleNavigate}
        >
          {ts("tabTemplates", "Templates")}
        </SidebarNavItem>
        <SidebarNavItem
          to="/ab-tests"
          icon={<FlaskConical size={16} />}
          disabled={locked}
          collapsed={collapsed}
          onNavigate={handleNavigate}
        >
          {ts("tabAbTesting", "A/B Tests")}
        </SidebarNavItem>

        <SidebarSection label="Audience" collapsed={collapsed} />
        <SidebarNavItem
          to="/users"
          icon={<Users size={16} />}
          disabled={locked}
          collapsed={collapsed}
          onNavigate={handleNavigate}
        >
          {ts("tabUsersDevices", "Users & Devices")}
        </SidebarNavItem>
        {!isMarketingManager && (
          <SidebarNavItem
            to="/history"
            icon={<History size={16} />}
            disabled={locked || !hasApps}
            collapsed={collapsed}
            onNavigate={handleNavigate}
          >
            {ts("tabHistory", "History")}
          </SidebarNavItem>
        )}

        {!isMarketingManager && (
          <>
            <SidebarSection label="Developer" collapsed={collapsed} />
            <SidebarNavItem
              to="/automation"
              icon={<Zap size={16} />}
              disabled={locked}
              collapsed={collapsed}
              onNavigate={handleNavigate}
            >
              {ts("tabAutomation", "Automation")}
            </SidebarNavItem>
            <SidebarNavItem
              to="/devx"
              icon={<Terminal size={16} />}
              disabled={locked}
              collapsed={collapsed}
              onNavigate={handleNavigate}
            >
              {ts("tabDevx", "SDKs")}
            </SidebarNavItem>
            <SidebarNavItem
              to="/simulator"
              icon={<FlaskConical size={16} />}
              disabled={locked}
              collapsed={collapsed}
              onNavigate={handleNavigate}
            >
              {ts("tabSimulator", "Simulator")}
            </SidebarNavItem>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="mt-auto border-t border-slate-100 pt-3">
        {/* Collapse toggle (desktop only) */}
        {!mobile && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={clsx(
              "mb-2 flex w-full items-center rounded-xl px-3 py-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600",
              collapsed && "justify-center",
            )}
          >
            {collapsed ? (
              <ChevronsRight size={16} />
            ) : (
              <>
                <ChevronsLeft size={16} />
                <span className="ms-2.5 text-[12px] font-medium">
                  Collapse
                </span>
              </>
            )}
          </button>
        )}

        {/* User Profile */}
        <div
          className={clsx(
            "flex items-center rounded-xl",
            collapsed ? "justify-center px-1 py-2" : "gap-2.5 px-3 py-2",
          )}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600"
            title={
              collapsed
                ? user?.name || user?.email || tc("unknownUser", "Unknown")
                : undefined
            }
          >
            {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <>
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
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
