import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { LanguageSelector } from "../components/LanguageSelector";
import { useI18n, useScopedTranslation } from "../context/I18nContext";
import { AppSelector } from "../components/AppSelector";

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
  "/admin-access": "Admin Access",
};

function getPageTitle(pathname: string): string {
  // Check exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Check prefix match for nested routes like /apps/:id
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

  return (
    <div
      className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900"
      dir={direction}
    >
      <Sidebar />

      <main className="relative flex-1 overflow-y-auto scroll-smooth">
        {/* Top bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white/80 px-8 py-3 backdrop-blur-md lg:px-10">
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          <div className="flex items-center gap-2.5">
            <AppSelector />
            <LanguageSelector />
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-semibold text-emerald-700">
                {ta("systemOnline", "Online")}
              </span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="px-8 py-6 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
