import { DeveloperHub } from "../components/devx/DeveloperHub";
import { WebhookManager } from "../components/WebhookManager";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";

export function DevXPage() {
  const { selectedApp } = useAppContext();
  const { token } = useAuth();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <DeveloperHub />
      <WebhookManager
        appId={selectedApp?.id || ""}
        appName={selectedApp?.name || ""}
        token={token || ""}
      />
    </div>
  );
}
