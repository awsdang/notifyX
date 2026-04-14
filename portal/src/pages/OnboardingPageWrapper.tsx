import { useNavigate } from "react-router-dom";
import { OnboardingPage } from "../components/OnboardingPage";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useOnboarding } from "../hooks/useOnboarding";

export function OnboardingPageWrapper() {
  const navigate = useNavigate();
  const { apps, createApp } = useAppContext();
  const { canManageCredentials } = useAuth();
  const onboarding = useOnboarding();

  const handleNavigate = (tab: string) => {
    // Map old tab names to new routes
    const routeMap: Record<string, string> = {
      dashboard: "/dashboard",
      credentials: "/credentials",
      apps: "/apps",
      send: "/send",
    };
    navigate(routeMap[tab] || `/${tab}`);
    if (tab === "dashboard") {
      onboarding.refresh();
    }
  };

  const handleCreateApp = async (name: string) => {
    await createApp(name);
    await onboarding.refresh();
  };

  return (
    <OnboardingPage
      hasApps={onboarding.hasApps}
      hasCredentials={onboarding.hasCredentials}
      apps={apps}
      canManageCredentials={canManageCredentials}
      onNavigate={handleNavigate}
      onCreateApp={handleCreateApp}
    />
  );
}
