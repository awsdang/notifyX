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

      <main className="relative flex-1 overflow-y-auto scroll-smooth bg-slate-50/50 p-8 lg:p-12">
        <header className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-black capitalize tracking-tight text-slate-900">
              {title}
            </h2>
            <p className="mt-1 font-medium text-slate-500">
              {ta(
                "headerSubtitleDefault",
                "Manage your notification infrastructure with intelligence.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AppSelector />
            <LanguageSelector />
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
                {ta("systemOnline", "System Online")}
              </span>
            </div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
