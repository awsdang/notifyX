import { SDKGenerator } from "../components/SDKGenerator";
import { WebhookManager } from "../components/WebhookManager";
import { Card, CardHeader, CardTitle } from "../components/ui/Card";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useScopedTranslation } from "../context/I18nContext";
import { Globe } from "lucide-react";

export function DevXPage() {
  const ta = useScopedTranslation("components", "AppShell");
  const { selectedApp } = useAppContext();
  const { token } = useAuth();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <SDKGenerator />
      <Card padding="lg">
        <CardHeader>
          <CardTitle icon={<Globe className="h-5 w-5 text-blue-600" />}>
            {ta("webhookManagementTitle", "Webhook Management")}
          </CardTitle>
        </CardHeader>
        <p className="-mt-2 mb-6 text-sm text-slate-500">
          {ta("webhookManagementSubtitle", "Receive real-time delivery and click insights")}
        </p>
        <WebhookManager
          appId={selectedApp?.id || ""}
          appName={selectedApp?.name || ""}
          token={token || ""}
        />
      </Card>
    </div>
  );
}
