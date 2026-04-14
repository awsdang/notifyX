import { SDKGenerator } from "../components/SDKGenerator";
import { WebhookManager } from "../components/WebhookManager";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { useScopedTranslation } from "../context/I18nContext";

export function DevXPage() {
  const ta = useScopedTranslation("components", "AppShell");
  const { selectedApp } = useAppContext();
  const { token } = useAuth();

  return (
    <div className="space-y-8">
      <SDKGenerator />
      <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {ta("webhookManagementTitle", "Webhook Management")}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {ta("webhookManagementSubtitle", "Receive real-time delivery and click insights")}
            </p>
          </div>
        </div>
        <WebhookManager
          appId={selectedApp?.id || ""}
          appName={selectedApp?.name || ""}
          token={token || ""}
        />
      </div>
    </div>
  );
}
