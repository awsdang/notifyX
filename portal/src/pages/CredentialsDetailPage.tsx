import { useParams, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { useOnboarding } from "../hooks/useOnboarding";
import { CredentialsPage } from "./CredentialsPage";
import { useI18n } from "../context/I18nContext";
import { Loader2 } from "lucide-react";

export function CredentialsDetailPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { direction } = useI18n();
  const { apps } = useAppContext();
  const onboarding = useOnboarding();
  const backwardArrow = direction === "rtl" ? "→" : "←";

  const app = apps.find((a) => a.id === appId);

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate("/credentials")}
        className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        {backwardArrow} Back to Apps
      </button>
      <CredentialsPage
        appId={app.id}
        appName={app.name}
        onCredentialChange={() => onboarding.refresh()}
      />
    </div>
  );
}
