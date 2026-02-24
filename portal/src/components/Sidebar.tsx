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
} from "lucide-react";
import { NavButton } from "./NavButton";
import { useScopedTranslation } from "../context/I18nContext";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  canManageCredentials: boolean;
  canManageAdminUsers?: boolean;
  logout: () => void;
  userName?: string;
  userRole?: string;
  hasApps?: boolean;
  isOnboarded?: boolean;
}

export function Sidebar({
  activeTab,
  setActiveTab,
  canManageCredentials,
  canManageAdminUsers = false,
  logout,
  userName,
  userRole,
  hasApps = true,
  isOnboarded = true,
}: SidebarProps) {
  const ts = useScopedTranslation("components", "Sidebar");
  const tc = useScopedTranslation("components", "common");
  const isMarketingManager = userRole === "MARKETING_MANAGER";

  // During onboarding, only "Manage Apps" and "Credentials" are accessible
  const locked = !isOnboarded && !isMarketingManager;

  return (
    <aside className="flex w-64 shrink-0 flex-col items-stretch gap-2 overflow-y-auto border-e border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-3 px-3 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-blue-600 to-purple-600 shadow-lg shadow-blue-200">
          <Bell className="h-6 w-6 text-white" />
        </div>
        <h1 className="bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-xl font-black tracking-tight text-transparent">
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
        {/* Dashboard / Getting Started (context-aware) */}
        <NavButton
          active={locked ? activeTab === "onboarding" : activeTab === "dashboard"}
          onClick={() => setActiveTab(locked ? "onboarding" : "dashboard")}
          icon={<LayoutDashboard size={20} />}
        >
          {locked
            ? ts("tabGettingStarted", "Getting Started")
            : ts("tabDashboard", "Dashboard")}
        </NavButton>

        {!isMarketingManager && (
          <NavButton
            active={activeTab === "apps"}
            onClick={() => setActiveTab("apps")}
            icon={<Settings size={20} />}
          >
            {ts("tabManageApps", "Manage Apps")}
          </NavButton>
        )}

        {canManageCredentials && (
          <NavButton
            active={activeTab === "credentials"}
            onClick={() => setActiveTab("credentials")}
            icon={<Key size={20} />}
          >
            {ts("tabCredentials", "Credentials")}
          </NavButton>
        )}

        {canManageAdminUsers && (
          <NavButton
            active={activeTab === "admin-access"}
            onClick={() => setActiveTab("admin-access")}
            icon={<Users size={20} />}
          >
            {ts("tabAdminAccess", "Admin Access")}
          </NavButton>
        )}

        {/* Locked items — shown but disabled during onboarding */}
        <NavButton
          active={activeTab === "send"}
          onClick={() => !locked && setActiveTab("send")}
          icon={<Send size={20} />}
          disabled={locked || !hasApps}
        >
          {ts("tabSendNotification", "Send Notification")}
        </NavButton>
        <NavButton
          active={activeTab === "history"}
          onClick={() => !locked && setActiveTab("history")}
          icon={<History size={20} />}
          disabled={locked || !hasApps}
        >
          {ts("tabHistory", "Notification History")}
        </NavButton>
        <NavButton
          active={activeTab === "campaigns"}
          onClick={() => !locked && setActiveTab("campaigns")}
          icon={<Megaphone size={20} />}
          disabled={locked}
        >
          {ts("tabCampaigns", "Campaigns")}
        </NavButton>
        <NavButton
          active={activeTab === "abtests"}
          onClick={() => !locked && setActiveTab("abtests")}
          icon={<FlaskConical size={20} />}
          disabled={locked}
        >
          {ts("tabAbTesting", "A/B Testing")}
        </NavButton>
        <NavButton
          active={activeTab === "templates"}
          onClick={() => !locked && setActiveTab("templates")}
          icon={<FileText size={20} />}
          disabled={locked}
        >
          {ts("tabTemplates", "Templates")}
        </NavButton>
        <NavButton
          active={activeTab === "users"}
          onClick={() => !locked && setActiveTab("users")}
          icon={<Users size={20} />}
          disabled={locked}
        >
          {ts("tabUsersDevices", "Users & Devices")}
        </NavButton>
        <NavButton
          active={activeTab === "automation"}
          onClick={() => !locked && setActiveTab("automation")}
          icon={<Zap size={20} />}
          disabled={locked}
        >
          {ts("tabAutomation", "Automation")}
        </NavButton>
        {!isMarketingManager && (
          <NavButton
            active={activeTab === "devx"}
            onClick={() => !locked && setActiveTab("devx")}
            icon={<Terminal size={20} />}
            disabled={locked}
          >
            {ts("tabDevx", "DevX & SDKs")}
          </NavButton>
        )}
        {!isMarketingManager && (
          <NavButton
            active={activeTab === "simulator"}
            onClick={() => !locked && setActiveTab("simulator")}
            icon={<FlaskConical size={20} />}
            disabled={locked}
          >
            {ts("tabSimulator", "Simulator")}
          </NavButton>
        )}

      </nav>

      <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {ts("signedIn", "Signed in")}
          </p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {userName || tc("unknownUser", "Unknown User")}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-indigo-600">
            {(userRole || tc("unknownRole", "unknown")).replace(/_/g, " ")}
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
