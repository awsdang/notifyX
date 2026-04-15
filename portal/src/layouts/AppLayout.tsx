import { Outlet, useLocation } from "react-router-dom";
import { useState, useCallback, useEffect } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { LanguageSelector } from "../components/LanguageSelector";
import { useI18n, useScopedTranslation } from "../context/I18nContext";
import { AppSelector } from "../components/AppSelector";

const SIDEBAR_COLLAPSED_KEY = "notifyx-sidebar-collapsed";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/onboarding": "Getting Started",
  "/send": "Send Notification",
  "/history": "Notification History",
  "/templates": "Templates",
  "/automation": "Automation",
  "/simulator": "Simulator",
  "/devx": "DevX & SDKs",
  "/apps": "Manage Apps",
  "/users": "Users & Devices",
  "/campaigns": "Campaigns",
  "/ab-tests": "A/B Testing",
  "/credentials": "Credentials",
  "/admin-access": "Team Management",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path + "/")) return title;
  }
  return "Dashboard";
}

export function AppLayout() {
  const location = useLocation();
  const { direction } = useI18n();
  const ta = useScopedTranslation("components", "AppShell");

  const title = getPageTitle(location.pathname);

  // Desktop collapse state (persisted)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  // Mobile drawer state
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div
      className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900"
      dir={direction}
    >
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-y-0 start-0 z-50 w-64 transform transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar mobile onClose={closeMobile} />
      </div>

      <main className="relative flex-1 overflow-y-auto scroll-smooth">
        {/* Top bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur-md md:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <AppSelector />
            <div className="hidden sm:block">
              <LanguageSelector />
            </div>
            <div className="hidden items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 sm:flex">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-semibold text-emerald-700">
                {ta("systemOnline", "Online")}
              </span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="px-4 py-4 md:px-8 md:py-6 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
