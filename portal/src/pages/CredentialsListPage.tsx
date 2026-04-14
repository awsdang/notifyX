import { useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
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

export function CredentialsListPage() {
  const navigate = useNavigate();
  const { direction } = useI18n();
  const ta = useScopedTranslation("components", "AppShell");
  const { apps } = useAppContext();
  const { canManageCredentials } = useAuth();
  const forwardArrow = direction === "rtl" ? "←" : "→";

  if (!canManageCredentials) {
    return (
      <div className="rounded-xl border bg-white p-12 text-center text-gray-400">
        <p>You don't have permission to manage credentials.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-gray-500">
        {ta("selectAppCredentials", "Select an app to manage its push provider credentials:")}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {apps.length === 0 ? (
          <div className="col-span-full rounded-xl border bg-white p-6 text-center text-gray-400">
            <Settings className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>{ta("noAppsRegisteredCreateFirst", "No apps registered. Create an app first!")}</p>
          </div>
        ) : (
          apps.map((app) => (
            <button
              key={app.id}
              onClick={() => navigate(`/credentials/${app.id}`)}
              className="rounded-xl border bg-white p-6 text-start transition-all hover:border-blue-500 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <AppAvatar app={app} className="h-10 w-10 rounded-2xl" />
                <h4 className="text-lg font-semibold">{app.name}</h4>
              </div>
              <p className="mt-1 font-mono text-xs text-gray-400">{app.id}</p>
              <p className="mt-3 flex items-center gap-1 text-sm text-blue-600">
                {ta("manageCredentials", "Manage Credentials")} {forwardArrow}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
