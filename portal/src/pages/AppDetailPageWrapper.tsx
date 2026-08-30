import { useParams, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { AppDetailPage } from "./AppDetailPage";
import { Loader2 } from "lucide-react";

export function AppDetailPageWrapper() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { apps, isLoading, refetchApps } = useAppContext();
  const { token } = useAuth();

  const app = apps.find((a) => a.id === appId);

  if (!app && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Finished loading and the app is still missing: it was deleted, or this
  // account has no access to it. Say so instead of spinning forever.
  if (!app) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-amber-800">
        <h4 className="font-bold">App unavailable</h4>
        <p className="mt-1 text-sm opacity-80">
          This app doesn't exist or your account doesn't have access to it.
        </p>
        <button
          onClick={() => navigate("/apps")}
          className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Back to apps
        </button>
      </div>
    );
  }

  return (
    <AppDetailPage
      app={app}
      token={token}
      onBack={() => navigate("/apps")}
      onUpdate={async () => {
        await refetchApps();
      }}
    />
  );
}
