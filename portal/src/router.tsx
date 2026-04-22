import { type ComponentType, lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { AuthGuard } from "./components/AuthGuard";

type PageComponent = ComponentType<object>;

function lazyPage(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] as PageComponent };
  });
}

function PageLoadingFallback() {
  return (
    <div className="flex min-h-80 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-6 py-12 text-sm font-medium text-slate-500 shadow-sm">
      Loading page...
    </div>
  );
}

function renderLazyPage(Component: PageComponent) {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Component />
    </Suspense>
  );
}

// Lazy-load pages for code splitting
const DashboardPageWrapper = lazyPage(
  () => import("./pages/DashboardPage"),
  "DashboardPageWrapper",
);
const SendPage = lazyPage(() => import("./pages/SendPage"), "SendPage");
const HistoryPage = lazyPage(() => import("./pages/HistoryPage"), "HistoryPage");
const CampaignsPage = lazyPage(
  () => import("./pages/CampaignsPage"),
  "CampaignsPage",
);
const ABTestsPage = lazyPage(() => import("./pages/ABTestsPage"), "ABTestsPage");
const TemplatesPage = lazyPage(
  () => import("./pages/TemplatesPage"),
  "TemplatesPage",
);
const UsersPage = lazyPage(() => import("./pages/UsersPage"), "UsersPage");
const AppsPage = lazyPage(() => import("./pages/AppsPage"), "AppsPage");
const AppDetailPageWrapper = lazyPage(
  () => import("./pages/AppDetailPageWrapper"),
  "AppDetailPageWrapper",
);
const CredentialsListPage = lazyPage(
  () => import("./pages/CredentialsListPage"),
  "CredentialsListPage",
);
const CredentialsDetailPage = lazyPage(
  () => import("./pages/CredentialsDetailPage"),
  "CredentialsDetailPage",
);
const AutomationPage = lazyPage(
  () => import("./pages/AutomationPage"),
  "AutomationPage",
);
const AppWorkflowsPage = lazyPage(
  () => import("./pages/AppWorkflowsPage"),
  "AppWorkflowsPage",
);
const AppTriggersPage = lazyPage(
  () => import("./pages/AppTriggersPage"),
  "AppTriggersPage",
);
const AppApiKeysPage = lazyPage(
  () => import("./pages/AppApiKeysPage"),
  "AppApiKeysPage",
);
const DevXPage = lazyPage(() => import("./pages/DevXPage"), "DevXPage");
const SimulatorPage = lazyPage(
  () => import("./pages/SimulatorPage"),
  "SimulatorPage",
);
const AdminAccessPage = lazyPage(
  () => import("./pages/AdminAccessPage"),
  "AdminAccessPage",
);
const OnboardingPageWrapper = lazyPage(
  () => import("./pages/OnboardingPageWrapper"),
  "OnboardingPageWrapper",
);

// Role-based route access map
const MARKETING_MANAGER_ALLOWED = new Set([
  "/dashboard",
  "/campaigns",
  "/ab-tests",
  "/templates",
  "/users",
]);

export function isRouteAllowed(pathname: string, role?: string): boolean {
  if (role !== "MARKETING_MANAGER") return true;
  // Check exact match or prefix
  for (const allowed of MARKETING_MANAGER_ALLOWED) {
    if (pathname === allowed || pathname.startsWith(allowed + "/")) return true;
  }
  return false;
}

export const router = createBrowserRouter([
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: renderLazyPage(DashboardPageWrapper) },
          { path: "onboarding", element: renderLazyPage(OnboardingPageWrapper) },
          { path: "send", element: renderLazyPage(SendPage) },
          { path: "history", element: renderLazyPage(HistoryPage) },
          { path: "campaigns", element: renderLazyPage(CampaignsPage) },
          { path: "ab-tests", element: renderLazyPage(ABTestsPage) },
          { path: "templates", element: renderLazyPage(TemplatesPage) },
          { path: "users", element: renderLazyPage(UsersPage) },
          { path: "apps", element: renderLazyPage(AppsPage) },
          { path: "apps/:appId", element: renderLazyPage(AppDetailPageWrapper) },
          { path: "apps/:appId/workflows", element: renderLazyPage(AppWorkflowsPage) },
          { path: "apps/:appId/triggers", element: renderLazyPage(AppTriggersPage) },
          { path: "apps/:appId/api-keys", element: renderLazyPage(AppApiKeysPage) },
          { path: "credentials", element: renderLazyPage(CredentialsListPage) },
          { path: "credentials/:appId", element: renderLazyPage(CredentialsDetailPage) },
          { path: "automation", element: renderLazyPage(AutomationPage) },
          { path: "devx", element: renderLazyPage(DevXPage) },
          { path: "simulator", element: renderLazyPage(SimulatorPage) },
          { path: "admin-access", element: renderLazyPage(AdminAccessPage) },
          // Catch-all
          { path: "*", element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
