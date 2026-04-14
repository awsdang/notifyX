import { useParams, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { AppDetailPage } from "./AppDetailPage";
import { Loader2 } from "lucide-react";

export function AppDetailPageWrapper() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { apps, refetchApps } = useAppContext();
  const { token } = useAuth();

  const app = apps.find((a) => a.id === appId);

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
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
