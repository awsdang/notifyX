import { useAppContext } from "../context/AppContext";
import { AutomationList } from "../components/AutomationList";
import { EmptyState } from "../components/ui/EmptyState";
import { Settings, Zap } from "lucide-react";

export function AutomationPage() {
  const { selectedApp, apps } = useAppContext();

  if (!apps.length) {
    return (
      <EmptyState
        icon={<Settings className="h-6 w-6" />}
        title="No apps registered"
        description="Create an app first to build automations."
      />
    );
  }

  if (!selectedApp) {
    return (
      <EmptyState
        icon={<Zap className="h-6 w-6" />}
        title="No app selected"
        description="Select an app from the header to manage automation workflows."
      />
    );
  }

  return (
    <AutomationList appId={selectedApp.id} appName={selectedApp.name} />
  );
}
