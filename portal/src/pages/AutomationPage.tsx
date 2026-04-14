import { useAppContext } from "../context/AppContext";
import { AutomationList } from "../components/AutomationList";
import { Settings } from "lucide-react";

export function AutomationPage() {
  const { selectedApp, apps } = useAppContext();

  if (!apps.length) {
    return (
      <div className="rounded-xl border bg-white p-12 text-center text-slate-400">
        <p>No apps registered. Create an app first to build automations.</p>
      </div>
    );
  }

  if (!selectedApp) {
    return (
      <div className="rounded-xl border bg-white p-12 text-center text-gray-400">
        <Settings className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <p className="mb-2 text-lg font-medium text-slate-900">No app selected</p>
        <p>Select an app from the header to manage automation workflows.</p>
      </div>
    );
  }

  return (
    <AutomationList appId={selectedApp.id} appName={selectedApp.name} />
  );
}
