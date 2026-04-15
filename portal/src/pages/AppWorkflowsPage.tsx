import { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { AutomationList } from "../components/AutomationList";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/EmptyState";
import { Settings } from "lucide-react";

export function AppWorkflowsPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { apps, selectedApp, setSelectedApp } = useAppContext();

  const app = apps.find((a) => a.id === appId);

  useEffect(() => {
    if (app && selectedApp?.id !== app.id) {
      setSelectedApp(app);
    }
  }, [app, selectedApp, setSelectedApp]);

  if (!apps.length) {
    return (
      <EmptyState
        icon={<Settings className="h-6 w-6" />}
        title="No apps registered"
        description="Create an app first to build automations."
      />
    );
  }

  if (!app) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/apps/${app.id}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="text-sm text-slate-500">
          <Link to="/apps" className="hover:text-slate-900">Apps</Link>
          <span className="mx-1">/</span>
          <Link to={`/apps/${app.id}`} className="hover:text-slate-900">{app.name}</Link>
          <span className="mx-1">/</span>
          <span className="font-medium text-slate-900">Workflows</span>
        </div>
      </div>
      <AutomationList appId={app.id} appName={app.name} section="workflows" />
    </div>
  );
}
