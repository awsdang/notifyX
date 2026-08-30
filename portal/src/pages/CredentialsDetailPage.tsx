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
  const { apps, isLoading } = useAppContext();
  const onboarding = useOnboarding();
  const backwardArrow = direction === "rtl" ? "→" : "←";

  const app = apps.find((a) => a.id === appId);

  if (!app && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate("/credentials")}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          {backwardArrow} Back to Apps
        </button>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 text-amber-800">
          <h4 className="font-bold">App unavailable</h4>
          <p className="mt-1 text-sm opacity-80">
            This app doesn't exist or your account doesn't have access to it.
          </p>
        </div>
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
