import { useState } from "react";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAppContext } from "../context/AppContext";
import { useConfirmDialog } from "../context/ConfirmDialogContext";
import { useI18n, useScopedTranslation } from "../context/I18nContext";
import type { Application } from "../types";

function AppAvatar({ app, className }: { app: Application; className?: string }) {
  if (app.notificationIconUrl) {
    return (
      <img
        src={app.notificationIconUrl}
        alt={app.name}
        className={`${className || ""} object-cover shadow-sm`}
      />
    );
  }
  return (
    <div
      className={`${className || ""} flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 text-sm font-black uppercase text-white shadow-sm`}
    >
      {app.name.slice(0, 1)}
    </div>
  );
}

export function AppsPage() {
  const navigate = useNavigate();
  const { direction } = useI18n();
  const ta = useScopedTranslation("components", "AppShell");
  const tc = useScopedTranslation("components", "common");
  const { confirm } = useConfirmDialog();
  const { apps, createApp, killApp, reviveApp } = useAppContext();
  const forwardArrow = direction === "rtl" ? "←" : "→";

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newAppName.trim()) return;
    setCreating(true);
    try {
      await createApp(newAppName.trim());
      setNewAppName("");
      setShowCreateDialog(false);
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (app: Application) => {
    const action = app.isKilled ? "activate" : "deactivate";
    const confirmed = await confirm({
      title: app.isKilled
        ? ta("confirmActivateAppTitle", "Activate App")
        : ta("confirmDeactivateAppTitle", "Deactivate App"),
      description: app.isKilled
        ? ta("confirmActivateAppDescription", "The app will start accepting notifications again.")
        : ta("confirmDeactivateAppDescription", "This will cancel all scheduled notifications."),
      confirmText: app.isKilled ? ta("activate", "Activate") : ta("deactivate", "Deactivate"),
      destructive: !app.isKilled,
    });
    if (!confirmed) return;
    try {
      if (app.isKilled) {
        await reviveApp(app.id);
      } else {
        await killApp(app.id);
      }
    } catch (error) {
      console.error(`Failed to ${action} app`, error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-slate-900">
            {ta("notificationsWorkspaces", "Notifications Workspaces")}
          </h3>
          <p className="text-gray-500">
            {ta("manageAppsDescription", "Manage your notification apps and services.")}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Settings className="me-2 h-4 w-4" />
          {ta("createApp", "Create App")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {apps.length === 0 ? (
          <div className="col-span-full rounded-xl border bg-white p-12 text-center text-gray-400">
            <Settings className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-lg font-medium text-slate-900">
              {ta("noAppsRegistered", "No apps registered")}
            </p>
            <p className="mb-6">
              {ta("createFirstApp", "Create your first app to get started!")}
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              {ta("createApp", "Create App")}
            </Button>
          </div>
        ) : (
          apps.map((app) => (
            <div
              key={app.id}
              className="group relative overflow-hidden rounded-xl border bg-white p-6 text-start transition-all hover:border-blue-500 hover:shadow-md"
            >
              <div className="absolute end-0 top-0 p-4">
                <span
                  className={`block h-2 w-2 rounded-full ${app.isKilled ? "bg-red-500" : "bg-green-500"}`}
                />
              </div>
              <div className="flex items-center gap-3">
                <AppAvatar app={app} className="h-12 w-12 rounded-2xl" />
                <div className="min-w-0">
                  <h4 className="truncate text-lg font-semibold transition-colors group-hover:text-blue-600">
                    {app.name}
                  </h4>
                  {app.notificationIconUrl && (
                    <p className="text-xs text-slate-500">Notification icon configured</p>
                  )}
                </div>
              </div>
              <p className="mb-4 mt-1 truncate font-mono text-xs text-slate-400">{app.id}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  onClick={() => navigate(`/apps/${app.id}`)}
                  className="flex items-center text-sm font-medium text-slate-500 transition-colors hover:text-blue-600"
                >
                  {ta("viewDetailsStats", "View details & stats")}
                  <span className="ms-1">{forwardArrow}</span>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  className={
                    app.isKilled
                      ? "text-green-600 hover:text-green-700"
                      : "text-amber-600 hover:text-amber-700"
                  }
                  onClick={() => toggleStatus(app)}
                >
                  {app.isKilled ? ta("activate", "Activate") : ta("deactivate", "Deactivate")}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-6">
              <h3 className="text-lg font-semibold text-slate-900">
                {ta("createAppModalTitle", "Create App")}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {ta("createAppModalDescription", "Create a new application workspace for notifications.")}
              </p>
            </div>
            <div className="space-y-3 p-6">
              <label className="block text-sm font-medium text-slate-700">
                {ta("appNameLabel", "App Name")}
              </label>
              <input
                className="w-full rounded-lg border p-2.5 text-sm"
                value={newAppName}
                onChange={(e) => setNewAppName(e.target.value)}
                placeholder={ta("appNamePlaceholder", "e.g. Cardy")}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 p-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewAppName("");
                }}
              >
                {tc("cancel", "Cancel")}
              </Button>
              <Button onClick={handleCreate} disabled={creating || !newAppName.trim()}>
                {creating ? ta("createAppLoading", "Creating...") : ta("createApp", "Create App")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
