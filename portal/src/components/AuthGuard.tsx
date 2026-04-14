import { useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Bell } from "lucide-react";
import { LoginPage } from "./LoginPage";
import { InitialSetupPage } from "./InitialSetupPage";
import { apiFetch } from "../lib/api";
import { isRouteAllowed } from "../router";
import { useOnboarding } from "../hooks/useOnboarding";

export function AuthGuard() {
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const location = useLocation();
  const onboarding = useOnboarding();

  const [setupStatusLoading, setSetupStatusLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupTokenRequired, setSetupTokenRequired] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setSetupStatusLoading(false);
      return;
    }

    let mounted = true;

    const loadSetupStatus = async () => {
      try {
        const status = await apiFetch<{
          setupRequired: boolean;
          setupTokenRequired: boolean;
        }>("/admin/setup-status");

        if (!mounted) return;
        setSetupRequired(status.setupRequired);
        setSetupTokenRequired(status.setupTokenRequired);
      } catch {
        if (!mounted) return;
        setSetupRequired(false);
        setSetupTokenRequired(false);
      } finally {
        if (mounted) setSetupStatusLoading(false);
      }
    };

    void loadSetupStatus();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  const handleSetupComplete = async (credentials: {
    email: string;
    password: string;
  }) => {
    setSetupRequired(false);
    await login(credentials.email, credentials.password);
  };

  // Loading state
  if (isLoading || setupStatusLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-purple-600">
            <Bell className="h-6 w-6 text-white" />
          </div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Initial setup
  if (!isAuthenticated && setupRequired) {
    return (
      <InitialSetupPage
        setupTokenRequired={setupTokenRequired}
        onSetupComplete={handleSetupComplete}
      />
    );
  }

  // Not authenticated
  if (!isAuthenticated) return <LoginPage />;

  // Role-based route guard
  if (!isRouteAllowed(location.pathname, user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Onboarding redirect (non-marketing managers who haven't completed setup)
  if (
    !onboarding.isLoading &&
    !onboarding.isOnboarded &&
    user?.role !== "MARKETING_MANAGER"
  ) {
    const allowedPaths = ["/apps", "/credentials", "/onboarding"];
    const isAllowed = allowedPaths.some(
      (p) => location.pathname === p || location.pathname.startsWith(p + "/"),
    );
    if (!isAllowed) {
      return <Navigate to="/onboarding" replace />;
    }
  }

  return <Outlet />;
}
