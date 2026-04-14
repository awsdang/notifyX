import { useAppContext } from "../context/AppContext";
import { TemplatesManager } from "../components/TemplatesManager";
import { Settings } from "lucide-react";

export function TemplatesPage() {
  const { selectedApp, apps } = useAppContext();

  if (!selectedApp) {
    return (
      <div className="rounded-xl border bg-white p-12 text-center text-gray-400">
        <Settings className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <p className="mb-2 text-lg font-medium text-slate-900">No app selected</p>
        <p>
          {apps.length === 0
            ? "Create an app first to manage templates."
            : "Select an app from the header to manage its templates."}
        </p>
      </div>
    );
  }

  return <TemplatesManager appId={selectedApp.id} />;
}
