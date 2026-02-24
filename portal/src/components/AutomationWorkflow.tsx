import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Clock,
  Filter,
  FlaskConical,
  Pause,
  Pencil,
  Play,
  Rocket,
  Settings2,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  type Automation,
  type AutomationSimulationResult,
  type AutomationStep,
  useAutomations,
} from "../hooks/useAutomations";
import { clsx } from "clsx";
import {
  AutomationStepEditorPage,
  AutomationTriggerEditorPage,
  formatDurationLabel,
  type AutomationTemplateOption,
  type EditableAutomationStep,
} from "./AutomationStepEditorPage";
import type { AutomationTriggerDefinition } from "../hooks/useAutomationTriggers";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

interface AutomationWorkflowProps {
  appId: string;
  appName?: string;
  automation: Automation;
  triggerOptions: AutomationTriggerDefinition[];
  allTriggerOptions: AutomationTriggerDefinition[];
  onBack: () => void;
}

type EditorState =
  | { kind: "trigger" }
  | { kind: "step"; step: EditableAutomationStep };

const toConfigRecord = (
  config: AutomationStep["config"] | Automation["triggerConfig"],
): Record<string, unknown> => {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  return config;
};

const toStepType = (step: AutomationStep): AutomationStep["type"] => {
  if (step.type === "delay") return "delay";
  if (step.type === "condition") return "condition";
  return "notification";
};

const normalizeStep = (step: AutomationStep, index: number): EditableAutomationStep => {
  const normalizedType = toStepType(step);
  const normalizedConfig = toConfigRecord(step.config);
  const fallbackColor =
    normalizedType === "delay"
      ? "bg-amber-500"
      : normalizedType === "condition"
        ? "bg-slate-500"
        : "bg-purple-500";

  const fallbackLabel =
    normalizedType === "delay"
      ? "Delay"
      : normalizedType === "condition"
        ? "If Condition"
        : "Send Notification";

  return {
    ...step,
    id: step.id || `step-${Date.now()}-${index}`,
    type: normalizedType,
    label: step.label || fallbackLabel,
    description: step.description,
    color: step.color || fallbackColor,
    config: normalizedConfig,
  };
};

const getNodeIcon = (type: AutomationStep["type"]) => {
  switch (type) {
    case "trigger":
      return <Users size={18} />;
    case "delay":
      return <Clock size={18} />;
    case "condition":
      return <Settings2 size={18} />;
    case "notification":
    case "action":
      return <Bell size={18} />;
    default:
      return <Settings2 size={18} />;
  }
};

const getDelaySummary = (step: AutomationStep): string => {
  const config = toConfigRecord(step.config);
  const waitDays =
    typeof config.waitDays === "number" && config.waitDays > 0
      ? Math.floor(config.waitDays)
      : 0;
  const waitHours =
    typeof config.waitHours === "number" && config.waitHours > 0
      ? Math.floor(config.waitHours)
      : 0;
  const waitMinutes =
    typeof config.waitMinutes === "number" && config.waitMinutes > 0
      ? Math.floor(config.waitMinutes)
      : 0;
  return formatDurationLabel(waitDays, waitHours, waitMinutes);
};

const getNodeDescription = (
  step: AutomationStep,
  templateLabelById: Map<string, string>,
): string => {
  if (step.type === "delay") {
    return step.description || `Wait ${getDelaySummary(step)} before next step`;
  }

  const config = toConfigRecord(step.config);

  if (step.type === "condition") {
    const field = typeof config.field === "string" ? config.field.trim() : "";
    const operator =
      typeof config.operator === "string" && config.operator.trim()
        ? config.operator.trim().replaceAll("_", " ")
        : "equals";
    const value = typeof config.value === "string" ? config.value.trim() : "";
    const onTrue =
      typeof config.onTrue === "string" && config.onTrue.trim()
        ? config.onTrue.trim()
        : "continue";
    const onFalse =
      typeof config.onFalse === "string" && config.onFalse.trim()
        ? config.onFalse.trim()
        : "stop";
    const branchLabel = `T:${onTrue} / F:${onFalse}`;

    if (!field) {
      return step.description || "Evaluate trigger condition";
    }

    if (operator === "exists") {
      return `${field} exists • ${branchLabel}`;
    }

    return `${field} ${operator} ${value || "value"} • ${branchLabel}`;
  }

  if (typeof config.body === "string" && config.body.trim()) {
    return config.body.trim();
  }
  if (typeof config.templateId === "string" && config.templateId.trim()) {
    const templateLabel = templateLabelById.get(config.templateId.trim());
    return `Template: ${templateLabel || config.templateId.trim()}`;
  }
  return step.description || "Dispatch a push notification";
};

const getNodeColor = (step: AutomationStep): string => {
  if (step.color) return step.color;
  if (step.type === "delay") return "bg-amber-500";
  if (step.type === "condition") return "bg-slate-500";
  return "bg-purple-500";
};

const createStepId = () => `step-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

interface TemplateRecord {
  id: string;
  eventName?: string;
  title?: string;
  language?: string;
}

export function AutomationWorkflow({
  appId,
  appName,
  automation,
  triggerOptions,
  allTriggerOptions,
  onBack,
}: AutomationWorkflowProps) {
  const { token } = useAuth();
  const {
    updateAutomation,
    publishAutomation,
    simulateAutomation,
    toggleAutomation,
  } = useAutomations(appId);

  const availableTriggerOptions = useMemo(() => {
    const currentTrigger = allTriggerOptions.find(
      (option) => option.eventName === automation.trigger,
    );

    if (
      currentTrigger &&
      !triggerOptions.some((option) => option.id === currentTrigger.id)
    ) {
      return [currentTrigger, ...triggerOptions];
    }

    return triggerOptions;
  }, [allTriggerOptions, automation.trigger, triggerOptions]);

  const triggerByEventName = useMemo(() => {
    const map = new Map<string, AutomationTriggerDefinition>();
    for (const option of allTriggerOptions) {
      map.set(option.eventName, option);
    }
    return map;
  }, [allTriggerOptions]);

  const [workflowName, setWorkflowName] = useState(automation.name);
  const [isActive, setIsActive] = useState(automation.isActive);
  const [draftVersion, setDraftVersion] = useState(
    automation.draftVersion || 1,
  );
  const [publishedVersion, setPublishedVersion] = useState<number | null>(
    automation.publishedVersion ?? null,
  );
  const [publishedAt, setPublishedAt] = useState<string | null>(
    automation.publishedAt ?? null,
  );
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(
    Boolean(
      automation.hasUnpublishedChanges ??
        (automation.publishedVersion === null ||
          (automation.draftVersion || 1) > (automation.publishedVersion || 0)),
    ),
  );
  const [trigger, setTrigger] = useState(
    automation.trigger || availableTriggerOptions[0]?.eventName || "",
  );
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    () => toConfigRecord(automation.triggerConfig),
  );
  const [nodes, setNodes] = useState<EditableAutomationStep[]>(() =>
    (automation.steps || []).map((step, index) => normalizeStep(step, index)),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [templates, setTemplates] = useState<AutomationTemplateOption[]>([]);
  const [simulationExternalUserId, setSimulationExternalUserId] = useState(
    "demo-user-123",
  );
  const [simulationPayload, setSimulationPayload] = useState(
    "{\n  \"key\": \"value\"\n}",
  );
  const [simulationMode, setSimulationMode] = useState<"draft" | "published">(
    "draft",
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] =
    useState<AutomationSimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const applyAutomationMeta = (record: Automation) => {
    setIsActive(record.isActive);
    setDraftVersion(record.draftVersion || 1);
    setPublishedVersion(record.publishedVersion ?? null);
    setPublishedAt(record.publishedAt ?? null);
    setHasUnpublishedChanges(
      Boolean(
        record.hasUnpublishedChanges ??
          (record.publishedVersion === null ||
            (record.draftVersion || 1) > (record.publishedVersion || 0)),
      ),
    );
  };

  useEffect(() => {
    if (!trigger && availableTriggerOptions[0]?.eventName) {
      setTrigger(availableTriggerOptions[0].eventName);
    }
  }, [availableTriggerOptions, trigger]);

  useEffect(() => {
    if (!token || !appId) {
      setTemplates([]);
      return;
    }

    let mounted = true;
    const loadTemplates = async () => {
      try {
        const records = await apiFetch<TemplateRecord[]>(
          `/templates?appId=${encodeURIComponent(appId)}`,
          {},
          token,
        );

        if (!mounted) return;

        const normalized = Array.isArray(records)
          ? records.map((record) => {
              const labelSource = record.eventName || record.title || "Template";
              const languageSuffix = record.language
                ? ` [${record.language.toUpperCase()}]`
                : "";
              return {
                id: record.id,
                label: `${labelSource}${languageSuffix}`,
              };
            })
          : [];

        setTemplates(normalized);
      } catch {
        if (!mounted) return;
        setTemplates([]);
      }
    };

    void loadTemplates();

    return () => {
      mounted = false;
    };
  }, [appId, token]);

  const templateLabelById = useMemo(
    () => new Map(templates.map((template) => [template.id, template.label])),
    [templates],
  );

  const addNotification = () => {
    const newStep: EditableAutomationStep = {
      id: createStepId(),
      type: "notification",
      label: "Send Notification",
      description: "Dispatch a push notification",
      color: "bg-purple-500",
      config: {
        title: "",
        body: "",
      },
    };
    setNodes((current) => [...current, newStep]);
    setEditorState({ kind: "step", step: newStep });
  };

  const addDelay = () => {
    const newStep: EditableAutomationStep = {
      id: createStepId(),
      type: "delay",
      label: "Delay 10m",
      description: "Wait before next step",
      config: { waitDays: 0, waitHours: 0, waitMinutes: 10 },
      color: "bg-amber-500",
    };
    setNodes((current) => [...current, newStep]);
    setEditorState({ kind: "step", step: newStep });
  };

  const addCondition = () => {
    const triggerEvent = trigger || availableTriggerOptions[0]?.eventName || "";
    const triggerOption = availableTriggerOptions.find(
      (option) => option.eventName === triggerEvent,
    );
    const schemaField = triggerOption?.conditionSchema?.[0];
    const conditionField = schemaField?.key || triggerOption?.conditionFields?.[0] || "";
    const defaultOperator =
      schemaField?.operators?.[0] || "equals";
    const defaultValue =
      schemaField?.type === "boolean"
        ? "true"
        : schemaField?.type === "enum"
          ? schemaField.enumValues?.[0] || ""
          : "";

    const newStep: EditableAutomationStep = {
      id: createStepId(),
      type: "condition",
      label: "If Condition",
      description: "Evaluate trigger payload",
      config: {
        triggerEvent,
        field: conditionField,
        operator: defaultOperator,
        value: defaultValue,
        onTrue: "continue",
        onFalse: "stop",
      },
      color: "bg-slate-500",
    };

    setNodes((current) => [...current, newStep]);
    setEditorState({ kind: "step", step: newStep });
  };

  const removeNode = (id: string) => {
    setNodes((current) => current.filter((node) => node.id !== id));
  };

  const handleSave = async (): Promise<boolean> => {
    const normalizedWorkflowName = workflowName.trim();
    const normalizedTrigger = trigger.trim();
    if (!normalizedWorkflowName || !normalizedTrigger) {
      return false;
    }

    setIsSaving(true);
    setSaveError(null);
    setPublishError(null);
    try {
      const selectedTrigger = triggerByEventName.get(normalizedTrigger);
      const normalizedTriggerConfig = {
        ...toConfigRecord(triggerConfig),
        ...(selectedTrigger
          ? {
              triggerId: selectedTrigger.id,
              description: selectedTrigger.description || undefined,
            }
          : {}),
      };

      const updated = await updateAutomation(automation.id, {
        name: normalizedWorkflowName,
        trigger: normalizedTrigger,
        triggerConfig: normalizedTriggerConfig,
        steps: nodes.map((step) => ({
          id: step.id,
          type: step.type,
          label: step.label,
          description: step.description,
          color: step.color,
          config: toConfigRecord(step.config),
        })),
      });
      applyAutomationMeta(updated);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save workflow.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    setIsTogglingActive(true);
    setPublishError(null);
    try {
      const updated = await toggleAutomation(automation.id);
      applyAutomationMeta(updated);
    } catch (error) {
      setPublishError(
        error instanceof Error ? error.message : "Failed to change workflow status.",
      );
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      const saved = await handleSave();
      if (!saved) {
        return;
      }
      const published = await publishAutomation(automation.id);
      applyAutomationMeta(published);
    } catch (error) {
      setPublishError(
        error instanceof Error ? error.message : "Failed to publish workflow.",
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const runSimulation = async () => {
    let parsedPayload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(simulationPayload.trim() || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Simulation payload must be a JSON object.");
      }
      parsedPayload = parsed as Record<string, unknown>;
    } catch (error) {
      setSimulationError(
        error instanceof Error ? error.message : "Simulation payload is invalid JSON.",
      );
      return;
    }

    setIsSimulating(true);
    setSimulationError(null);
    setSimulationResult(null);
    try {
      const result = await simulateAutomation(automation.id, {
        externalUserId: simulationExternalUserId.trim() || undefined,
        payload: parsedPayload,
        usePublished: simulationMode === "published",
      });
      setSimulationResult(result);
    } catch (error) {
      setSimulationError(
        error instanceof Error ? error.message : "Failed to run workflow simulation.",
      );
    } finally {
      setIsSimulating(false);
    }
  };

  if (editorState?.kind === "trigger") {
    return (
      <AutomationTriggerEditorPage
        initialTrigger={trigger}
        triggerOptions={availableTriggerOptions}
        onBack={() => setEditorState(null)}
        onSave={({ trigger: nextTrigger, description }) => {
          setTrigger(nextTrigger);
          setTriggerConfig((current) => {
            const nextConfig = { ...toConfigRecord(current) };
            if (description) {
              nextConfig.description = description;
            } else {
              delete nextConfig.description;
            }
            return nextConfig;
          });
          setEditorState(null);
        }}
      />
    );
  }

  if (editorState?.kind === "step") {
    return (
      <AutomationStepEditorPage
        step={editorState.step}
        triggerOptions={availableTriggerOptions}
        templateOptions={templates}
        conditionStepTargets={nodes
          .filter((node) => node.id !== editorState.step.id)
          .map((node, index) => ({
            id: node.id,
            label: `${index + 1}. ${node.label || node.type}`,
          }))}
        onBack={() => setEditorState(null)}
        onDelete={() => {
          removeNode(editorState.step.id);
          setEditorState(null);
        }}
        onSave={(updatedStep) => {
          setNodes((current) =>
            current.map((node) =>
              node.id === updatedStep.id ? updatedStep : node,
            ),
          );
          setEditorState(null);
        }}
      />
    );
  }

  const triggerDefinition = triggerByEventName.get(trigger);

  const triggerDescription =
    typeof triggerConfig.description === "string" && triggerConfig.description.trim()
      ? triggerConfig.description
      : triggerDefinition?.description || "Fires when this event occurs";

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col animate-in fade-in duration-500">
      <header className="z-10 flex items-center justify-between rounded-t-3xl border bg-white px-8 py-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="rounded-full text-gray-400 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <Zap className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <input
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              className="w-64 border-none bg-transparent p-0 text-lg font-bold text-gray-900 outline-none focus:ring-0"
            />
            <p className="mt-0.5 text-xs text-gray-400">
              Automated delivery pipeline {appName ? `for ${appName}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Draft v{draftVersion}
          </div>
          <div
            className={clsx(
              "rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
              publishedVersion
                ? "border-blue-100 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-50 text-slate-500",
            )}
          >
            {publishedVersion ? `Published v${publishedVersion}` : "Not Published"}
          </div>
          <div
            className={clsx(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all",
              isActive
                ? "border-green-100 bg-green-50 text-green-700"
                : "border-gray-100 bg-gray-50 text-gray-400",
            )}
          >
            <div
              className={clsx(
                "h-2 w-2 rounded-full",
                isActive ? "bg-green-500" : "bg-gray-300",
              )}
            />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {isActive ? "Live" : "Draft"}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={handlePublish}
            disabled={isPublishing || isSaving || !workflowName.trim() || !trigger.trim()}
            className="h-10 rounded-xl px-4"
          >
            <Rocket size={16} className="me-2" />
            {isPublishing ? "Publishing..." : "Publish"}
          </Button>
          <Button
            variant="outline"
            onClick={handleToggleActive}
            disabled={isTogglingActive || (!isActive && publishedVersion === null)}
            className="h-10 rounded-xl px-4"
          >
            {isActive ? (
              <Pause size={16} className="me-2" />
            ) : (
              <Play size={16} className="me-2" />
            )}
            {isTogglingActive ? "Updating..." : isActive ? "Pause" : "Activate"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !workflowName.trim() || !trigger.trim()}
            className="h-10 rounded-xl bg-blue-600 px-6 shadow-lg shadow-blue-500/20 hover:bg-blue-700"
          >
            {isSaving ? "Saving..." : "Save Workflow"}
          </Button>
        </div>
      </header>

      <div className="relative flex-1 overflow-y-auto rounded-b-3xl border border-t-0 bg-slate-50/50 p-12">
        <div className="absolute bottom-0 start-1/2 top-0 w-0.5 -translate-x-1/2 bg-gradient-to-b from-purple-200 via-blue-200 to-transparent" />

        <div className="relative mx-auto flex max-w-5xl flex-col gap-8">
          {saveError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {saveError}
            </div>
          ) : null}

          {publishError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {publishError}
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h4 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <FlaskConical className="h-4 w-4 text-indigo-600" />
                  Workflow Simulator
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  Run this workflow against sample payloads and inspect each step trace.
                </p>
                {publishedAt ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Last published at {new Date(publishedAt).toLocaleString()}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    Publish a version to simulate production behavior safely.
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                {hasUnpublishedChanges
                  ? "Draft has unpublished changes"
                  : "Draft matches published version"}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Mode
                </span>
                <select
                  value={simulationMode}
                  onChange={(event) =>
                    setSimulationMode(event.target.value as "draft" | "published")
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                >
                  <option value="draft">Draft (latest edits)</option>
                  <option value="published" disabled={publishedVersion === null}>
                    Published {publishedVersion ? `(v${publishedVersion})` : ""}
                  </option>
                </select>
              </label>
              <label className="space-y-2 lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  externalUserId
                </span>
                <input
                  value={simulationExternalUserId}
                  onChange={(event) => setSimulationExternalUserId(event.target.value)}
                  placeholder="demo-user-123"
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Payload (JSON object)
              </span>
              <textarea
                value={simulationPayload}
                onChange={(event) => setSimulationPayload(event.target.value)}
                rows={6}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-xs"
              />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={runSimulation} disabled={isSimulating}>
                <FlaskConical size={16} className="me-2" />
                {isSimulating ? "Simulating..." : "Run Simulation"}
              </Button>
              {simulationResult ? (
                <span
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    simulationResult.status === "COMPLETED"
                      ? "bg-emerald-100 text-emerald-700"
                      : simulationResult.status === "MAX_STEPS"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-rose-100 text-rose-700",
                  )}
                >
                  {simulationResult.status}
                </span>
              ) : null}
            </div>

            {simulationError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {simulationError}
              </div>
            ) : null}

            {simulationResult ? (
              <div className="mt-5 space-y-3">
                {simulationResult.trace.map((traceItem) => (
                  <div
                    key={`${traceItem.stepId}-${traceItem.stepIndex}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        Step {traceItem.stepIndex + 1}: {traceItem.label || traceItem.stepType}
                      </p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {traceItem.stepType}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{traceItem.summary}</p>
                    {traceItem.branch ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Branch target: <span className="font-mono">{traceItem.branch}</span>
                      </p>
                    ) : null}
                    {traceItem.error ? (
                      <p className="mt-1 text-xs text-rose-600">{traceItem.error}</p>
                    ) : null}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Context Snapshot
                      </summary>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
                        {JSON.stringify(traceItem.context, null, 2)}
                      </pre>
                    </details>
                    {traceItem.notificationPayload ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-indigo-600">
                          Notification Payload
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-indigo-950 p-3 text-[11px] text-indigo-100">
                          {JSON.stringify(traceItem.notificationPayload, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mx-auto flex w-full max-w-xl flex-col items-center space-y-12">
          <div className="group flex w-full flex-col items-center">
            <div className="relative w-full rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm transition-all duration-500 hover:border-blue-100 hover:shadow-xl">
              <div className="flex items-center gap-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg">
                  <Users size={18} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Trigger
                    </span>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold text-amber-700">
                      START
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-gray-900">
                    {triggerDefinition?.name || trigger || "No trigger"}
                  </h4>
                  <p className="text-sm text-gray-500">{triggerDescription}</p>
                  <p className="mt-1 font-mono text-xs text-gray-400">{trigger}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditorState({ kind: "trigger" })}
                  className="rounded-xl text-gray-400 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100"
                >
                  <Pencil size={18} />
                </Button>
              </div>
            </div>
            <div className="flex h-12 w-8 items-center justify-center">
              <ChevronRight className="rotate-90 text-blue-300" />
            </div>
          </div>

          {nodes.map((node) => (
            <div key={node.id} className="group flex w-full flex-col items-center">
              <div className="relative w-full rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm transition-all duration-500 hover:border-blue-100 hover:shadow-xl">
                <div className="flex items-center gap-5">
                  <div
                    className={clsx(
                      "flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg",
                      getNodeColor(node),
                    )}
                  >
                    {getNodeIcon(node.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        {node.type}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-gray-900">{node.label}</h4>
                    <p className="line-clamp-2 text-sm text-gray-500">
                      {getNodeDescription(node, templateLabelById)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditorState({ kind: "step", step: node })}
                      className="rounded-xl text-gray-400 opacity-0 transition-opacity hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100"
                    >
                      <Pencil size={18} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeNode(node.id)}
                      className="rounded-xl text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex h-12 w-8 items-center justify-center">
                <ChevronRight className="rotate-90 text-blue-300" />
              </div>
            </div>
          ))}

          <div className="z-10 flex items-center gap-4 rounded-full border border-gray-100 bg-white p-2 shadow-lg">
            <button
              onClick={addNotification}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-600 transition-colors hover:bg-purple-100"
              title="Add Notification"
            >
              <Bell size={18} />
            </button>
            <button
              onClick={addCondition}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
              title="Add If Statement"
            >
              <Filter size={18} />
            </button>
            <button
              onClick={addDelay}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100"
              title="Add Delay"
            >
              <Clock size={18} />
            </button>
          </div>

          <div className="pt-8 text-center">
            <p className="text-xs text-gray-400">
              Add notification, condition, or delay steps to build the automation chain.
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
