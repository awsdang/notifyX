import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Pause,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { SkeletonCard } from "./ui/Skeleton";
import { useAutomations, type Automation } from "../hooks/useAutomations";
import {
  useAutomationTriggers,
} from "../hooks/useAutomationTriggers";
import { AutomationWorkflow } from "./AutomationWorkflow";
import { AutomationTriggersPage } from "./AutomationTriggersPage";

type AutomationSection = "workflows" | "triggers";

interface AutomationListProps {
  appId: string;
  appName?: string;
}

export function AutomationList({ appId, appName }: AutomationListProps) {
  const {
    automations,
    isLoading,
    toggleAutomation,
    deleteAutomation,
    createAutomation,
    fetchAutomations,
  } = useAutomations(appId);
  const {
    triggers,
    isLoading: triggersLoading,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    testTrigger,
  } = useAutomationTriggers(appId);

  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null,
  );
  const [activeSection, setActiveSection] = useState<AutomationSection>(
    "workflows",
  );
  const [inlineError, setInlineError] = useState<string | null>(null);

  const activeTriggers = useMemo(
    () => triggers.filter((trigger) => trigger.isActive),
    [triggers],
  );

  const triggerNameByEvent = useMemo(() => {
    const map = new Map<string, string>();
    for (const trigger of triggers) {
      map.set(trigger.eventName, trigger.name);
    }
    return map;
  }, [triggers]);

  if (editingAutomation) {
    return (
      <AutomationWorkflow
        appId={appId}
        appName={appName}
        automation={editingAutomation}
        triggerOptions={activeTriggers}
        allTriggerOptions={triggers}
        onBack={() => {
          setEditingAutomation(null);
          void fetchAutomations();
        }}
      />
    );
  }

  const handleCreate = async () => {
    setInlineError(null);

    const fallbackTrigger = activeTriggers[0];
    if (!fallbackTrigger) {
      setInlineError(
        "Create at least one active trigger before creating a workflow.",
      );
      setActiveSection("triggers");
      return;
    }

    const newAuto = await createAutomation({
      name: "New Automation Workflow",
      trigger: fallbackTrigger.eventName,
      triggerConfig: {
        triggerId: fallbackTrigger.id,
        description: fallbackTrigger.description || undefined,
      },
      steps: [],
      isActive: false,
    });

    setEditingAutomation(newAuto);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900">Automation Workflows</h3>
          <p className="mt-1 text-sm text-slate-500">
            Build trigger-based notification pipelines for {appName || "this app"}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveSection("workflows")}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                activeSection === "workflows"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600"
              }`}
            >
              Workflows
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("triggers")}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                activeSection === "triggers"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600"
              }`}
            >
              Triggers
            </button>
          </div>

          {activeSection === "workflows" ? (
            <Button onClick={handleCreate}>
              <Plus size={16} className="me-2" />
              Create Workflow
            </Button>
          ) : null}
        </div>
      </div>

      {inlineError ? (
        <Card padding="sm" className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-700">{inlineError}</p>
        </Card>
      ) : null}

      {activeSection === "triggers" ? (
        <AutomationTriggersPage
          appId={appId}
          appName={appName}
          triggers={triggers}
          isLoading={triggersLoading}
          createTrigger={createTrigger}
          updateTrigger={updateTrigger}
          deleteTrigger={deleteTrigger}
          testTrigger={testTrigger}
        />
      ) : (
        <>
          {!triggersLoading && activeTriggers.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-semibold">No active triggers configured</p>
                <p className="text-sm">
                  Add or activate triggers first. Workflows can only use trigger
                  definitions from the Triggers tab.
                </p>
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : automations.length === 0 ? (
            <EmptyState
              icon={<Zap className="h-6 w-6" />}
              title="No workflows yet"
              description="Create your first automated workflow to engage users automatically."
              action={{
                label: "Create First Workflow",
                onClick: handleCreate,
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {automations.map((auto) => (
                <div
                  key={auto.id}
                  className="rounded-2xl border bg-white p-6 transition-shadow hover:shadow-lg"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                      <Zap size={20} />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Badge variant={auto.isActive ? "success" : "default"} dot>
                        {auto.isActive ? "Live" : "Inactive"}
                      </Badge>
                      <Badge variant={auto.publishedVersion ? "info" : "default"}>
                        {auto.publishedVersion
                          ? `v${auto.publishedVersion}`
                          : "Unpublished"}
                      </Badge>
                      {auto.hasUnpublishedChanges ? (
                        <Badge variant="warning" dot>
                          Unsaved
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <h4 className="line-clamp-1 text-lg font-bold text-slate-900">{auto.name}</h4>
                  <p className="mb-4 mt-1 line-clamp-2 text-sm text-slate-500">
                    {auto.description ||
                      `Triggered by ${triggerNameByEvent.get(auto.trigger) || auto.trigger}`}
                  </p>

                  <div className="mb-6 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-600">
                    <span className="rounded-md border border-slate-100 bg-white px-2 py-1 shadow-sm">
                      {triggerNameByEvent.get(auto.trigger) || auto.trigger}
                    </span>
                    <ArrowRight size={14} className="text-slate-400" />
                    <span className="text-slate-500">{auto.steps.length} steps</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingAutomation(auto)}
                      className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    >
                      Edit Workflow
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          setInlineError(null);
                          try {
                            await toggleAutomation(auto.id);
                          } catch (error) {
                            setInlineError(
                              error instanceof Error
                                ? error.message
                                : "Failed to change workflow runtime status.",
                            );
                          }
                        }}
                        className={
                          auto.isActive
                            ? "text-amber-500 hover:bg-amber-50"
                            : "text-green-600 hover:bg-green-50"
                        }
                      >
                        {auto.isActive ? <Pause size={16} /> : <Play size={16} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAutomation(auto.id)}
                        className="text-slate-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
