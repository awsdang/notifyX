import { useNavigate } from "react-router-dom";
import { useStatsManager } from "../hooks/useStatsManager";
import { Dashboard } from "../components/Dashboard";

export function DashboardPageWrapper() {
  const { stats, isLoading } = useStatsManager();
  const navigate = useNavigate();

  const handleNavigate = (tab: string) => {
    const routeMap: Record<string, string> = {
      automation: "/automation",
      credentials: "/credentials",
      send: "/send",
      campaigns: "/campaigns",
      templates: "/templates",
      users: "/users",
      apps: "/apps",
    };
    navigate(routeMap[tab] || `/${tab}`);
  };

  return (
    <Dashboard
      stats={stats}
      isLoading={isLoading}
      setActiveTab={handleNavigate}
    />
  );
}
