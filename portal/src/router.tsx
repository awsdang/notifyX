import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { AuthGuard } from "./components/AuthGuard";

// Lazy-load pages for code splitting
import { DashboardPageWrapper } from "./pages/DashboardPage";
import { SendPage } from "./pages/SendPage";
import { HistoryPage } from "./pages/HistoryPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { ABTestsPage } from "./pages/ABTestsPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { UsersPage } from "./pages/UsersPage";
import { AppsPage } from "./pages/AppsPage";
import { AppDetailPageWrapper } from "./pages/AppDetailPageWrapper";
import { CredentialsListPage } from "./pages/CredentialsListPage";
import { CredentialsDetailPage } from "./pages/CredentialsDetailPage";
import { AutomationPage } from "./pages/AutomationPage";
import { AppWorkflowsPage } from "./pages/AppWorkflowsPage";
import { AppTriggersPage } from "./pages/AppTriggersPage";
import { DevXPage } from "./pages/DevXPage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { AdminAccessPage } from "./pages/AdminAccessPage";
import { OnboardingPageWrapper } from "./pages/OnboardingPageWrapper";

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
          { path: "dashboard", element: <DashboardPageWrapper /> },
          { path: "onboarding", element: <OnboardingPageWrapper /> },
          { path: "send", element: <SendPage /> },
          { path: "history", element: <HistoryPage /> },
          { path: "campaigns", element: <CampaignsPage /> },
          { path: "ab-tests", element: <ABTestsPage /> },
          { path: "templates", element: <TemplatesPage /> },
          { path: "users", element: <UsersPage /> },
          { path: "apps", element: <AppsPage /> },
          { path: "apps/:appId", element: <AppDetailPageWrapper /> },
          { path: "apps/:appId/workflows", element: <AppWorkflowsPage /> },
          { path: "apps/:appId/triggers", element: <AppTriggersPage /> },
          { path: "credentials", element: <CredentialsListPage /> },
          { path: "credentials/:appId", element: <CredentialsDetailPage /> },
          { path: "automation", element: <AutomationPage /> },
          { path: "devx", element: <DevXPage /> },
          { path: "simulator", element: <SimulatorPage /> },
          { path: "admin-access", element: <AdminAccessPage /> },
          // Catch-all
          { path: "*", element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
