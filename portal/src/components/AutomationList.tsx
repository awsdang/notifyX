import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Filter,
  Pause,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { SkeletonCard } from "./ui/Skeleton";
import { useAutomations, type Automation } from "../hooks/useAutomations";
import {
  useAutomationTriggers,
} from "../hooks/useAutomationTriggers";
import { AutomationWorkflow } from "./AutomationWorkflow";
import { AutomationTriggersPage } from "./AutomationTriggersPage";
import { clsx } from "clsx";

type AutomationSection = "workflows" | "triggers";
type StatusFilter = "all" | "active" | "inactive";

interface AutomationListProps {
  appId: string;
  appName?: string;
  /**
   * When provided, renders only that section and hides the tab toggle.
   * Used by the per-app routes (/apps/:id/workflows and /apps/:id/triggers).
   */
  section?: AutomationSection;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function AutomationList({ appId, appName, section }: AutomationListProps) {
  const sectionLocked = section !== undefined;
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
    section ?? "workflows",
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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

  const filteredAutomations = useMemo(() => {
    if (statusFilter === "all") return automations;
    return automations.filter((a) =>
      statusFilter === "active" ? a.isActive : !a.isActive,
    );
  }, [automations, statusFilter]);

  const stats = useMemo(() => {
    const total = automations.length;
    const active = automations.filter((a) => a.isActive).length;
    const published = automations.filter((a) => a.publishedVersion).length;
    return { total, active, published };
  }, [automations]);

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900">
            {activeSection === "triggers" ? "Triggers" : "Automation Workflows"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {activeSection === "triggers"
              ? `Event triggers for ${appName || "this app"}.`
              : `Build trigger-based notification pipelines for ${appName || "this app"}.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!sectionLocked && (
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setActiveSection("workflows")}
                className={clsx(
                  "rounded-lg px-4 py-1.5 text-sm font-semibold transition-all",
                  activeSection === "workflows"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Zap size={14} />
                  Workflows
                  {stats.total > 0 && (
                    <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold">
                      {stats.total}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("triggers")}
                className={clsx(
                  "rounded-lg px-4 py-1.5 text-sm font-semibold transition-all",
                  activeSection === "triggers"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Filter size={14} />
                  Triggers
                  {triggers.length > 0 && (
                    <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold">
                      {triggers.length}
                    </span>
                  )}
                </span>
              </button>
            </div>
          )}

          {sectionLocked && (
            <Link
              to={
                activeSection === "workflows"
                  ? `/apps/${appId}/triggers`
                  : `/apps/${appId}/workflows`
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              {activeSection === "workflows" ? (
                <>
                  <Filter size={14} />
                  Manage Triggers
                  {triggers.length > 0 && (
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {triggers.length}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Zap size={14} />
                  Manage Workflows
                  {stats.total > 0 && (
                    <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {stats.total}
                    </span>
                  )}
                </>
              )}
            </Link>
          )}

          {activeSection === "workflows" ? (
            <Button onClick={handleCreate}>
              <Plus size={16} className="me-2" />
              Create Workflow
            </Button>
          ) : null}
        </div>
      </div>

      {inlineError ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">{inlineError}</p>
        </div>
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
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">No active triggers configured</p>
                <p className="text-sm">
                  Add or activate triggers first. Workflows can only use trigger
                  definitions from the Triggers tab.
                </p>
              </div>
            </div>
          ) : null}

          {/* Status filter + stats bar */}
          {automations.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="font-medium">{stats.active} active</span>
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <span className="font-medium">{stats.published} published</span>
                </div>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                {(["all", "active", "inactive"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={clsx(
                      "rounded-md px-3 py-1 text-xs font-medium capitalize transition-all",
                      statusFilter === f
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

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
          ) : filteredAutomations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
              <Filter className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">
                No {statusFilter} workflows found
              </p>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="mt-2 text-sm font-medium text-blue-600 hover:underline"
              >
                Clear filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredAutomations.map((auto) => (
                <div
                  key={auto.id}
                  onClick={() => setEditingAutomation(auto)}
                  className="group cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-6 transition-all hover:border-blue-200 hover:shadow-lg"
                >
                  {/* Top row: icon + badges */}
                  <div className="mb-4 flex items-start justify-between">
                    <div
                      className={clsx(
                        "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                        auto.isActive
                          ? "bg-purple-50 text-purple-600"
                          : "bg-slate-100 text-slate-400",
                      )}
                    >
                      <Zap size={20} />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Badge variant={auto.isActive ? "success" : "default"} dot>
                        {auto.isActive ? "Live" : "Inactive"}
                      </Badge>
                      <Badge variant={auto.publishedVersion ? "info" : "default"}>
                        {auto.publishedVersion
                          ? `v${auto.publishedVersion}`
                          : "Draft"}
                      </Badge>
                      {auto.hasUnpublishedChanges ? (
                        <Badge variant="warning" dot>
                          Unsaved
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {/* Name + description */}
                  <h4 className="line-clamp-1 text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                    {auto.name}
                  </h4>
                  <p className="mb-4 mt-1 line-clamp-2 text-sm text-slate-500">
                    {auto.description ||
                      `Triggered by ${triggerNameByEvent.get(auto.trigger) || auto.trigger}`}
                  </p>

                  {/* Flow preview */}
                  <div className="mb-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-600">
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 shadow-sm">
                      {triggerNameByEvent.get(auto.trigger) || auto.trigger}
                    </span>
                    <ArrowRight size={14} className="text-slate-400 shrink-0" />
                    <span className="text-slate-500">
                      {auto.steps.length} {auto.steps.length === 1 ? "step" : "steps"}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="mb-4 flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      Updated {formatRelativeTime(auto.updatedAt)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingAutomation(auto);
                      }}
                      className="text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    >
                      Edit Workflow
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async (e) => {
                          e.stopPropagation();
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
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteAutomation(auto.id);
                        }}
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
