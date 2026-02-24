import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Clock3,
  Filter,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./ui/button";
import type { AutomationStep } from "../hooks/useAutomations";
import type {
  AutomationTriggerDefinition,
  TriggerConditionFieldType,
  TriggerConditionOperator,
  TriggerConditionSchemaField,
} from "../hooks/useAutomationTriggers";

const toConfigRecord = (
  config: AutomationStep["config"],
): Record<string, unknown> => {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  return config;
};

const getStringConfig = (
  config: Record<string, unknown>,
  key: string,
): string => {
  const value = config[key];
  return typeof value === "string" ? value : "";
};

const getScalarConfig = (
  config: Record<string, unknown>,
  key: string,
): string => {
  const value = config[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
};

const getNumberConfig = (
  config: Record<string, unknown>,
  key: string,
): number => {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
};

const parseDurationPart = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

export type EditableAutomationStep = AutomationStep & { id: string };
export type StepEditorKind = "notification" | "delay" | "condition";

export interface AutomationTemplateOption {
  id: string;
  label: string;
}

export function getStepEditorKind(step: AutomationStep): StepEditorKind {
  if (step.type === "delay") return "delay";
  if (step.type === "condition") return "condition";
  return "notification";
}

export function formatDurationLabel(
  waitDays: number,
  waitHours: number,
  waitMinutes: number,
): string {
  const parts: string[] = [];
  if (waitDays > 0) parts.push(`${waitDays}d`);
  if (waitHours > 0) parts.push(`${waitHours}h`);
  if (waitMinutes > 0) parts.push(`${waitMinutes}m`);
  if (parts.length === 0) {
    return "0m";
  }
  return parts.join(" ");
}

interface AutomationTriggerEditorPageProps {
  initialTrigger: string;
  triggerOptions: AutomationTriggerDefinition[];
  onBack: () => void;
  onSave: (payload: { trigger: string; description: string }) => void;
}

export function AutomationTriggerEditorPage({
  initialTrigger,
  triggerOptions,
  onBack,
  onSave,
}: AutomationTriggerEditorPageProps) {
  const defaultTrigger = triggerOptions.find(
    (trigger) => trigger.eventName === initialTrigger,
  ) || triggerOptions[0];

  const [trigger, setTrigger] = useState(initialTrigger || defaultTrigger?.eventName || "");
  const [error, setError] = useState("");

  const selectedTrigger =
    triggerOptions.find((option) => option.eventName === trigger) || null;
  const selectedTriggerFields = getConditionFieldsForTrigger(selectedTrigger);

  const handleSave = () => {
    const normalizedTrigger = trigger.trim();
    if (!normalizedTrigger) {
      setError("Trigger selection is required.");
      return;
    }

    setError("");
    onSave({
      trigger: normalizedTrigger,
      description: selectedTrigger?.description?.trim() || "",
    });
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-3xl border bg-white shadow-sm">
      <header className="flex items-center justify-between border-b px-8 py-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
            <ArrowLeft size={20} />
          </Button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Trigger Step
            </p>
            <h3 className="text-xl font-bold text-slate-900">Select Trigger</h3>
          </div>
        </div>
        <Button
          onClick={handleSave}
          className="h-10 rounded-xl bg-blue-600 px-6 hover:bg-blue-700"
        >
          <Save size={16} className="me-2" />
          Save Trigger
        </Button>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-8 overflow-y-auto p-8 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Trigger</label>
            <select
              value={trigger}
              onChange={(event) => setTrigger(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:border-blue-300 focus:outline-none"
            >
              <option value="">Select trigger</option>
              {triggerOptions.map((option) => (
                <option key={option.id} value={option.eventName}>
                  {option.name} ({option.eventName})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              Start triggers come from the Triggers page only.
            </p>
          </div>

          {selectedTriggerFields.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Condition fields for this trigger</p>
              <p className="mt-1">
                {selectedTriggerFields.map((field) => field.key).join(", ")}
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-blue-100 bg-blue-50/50 p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">
              Preview
            </p>
            <h4 className="mt-2 text-lg font-bold text-slate-900">
              {selectedTrigger?.name || "Trigger Name"}
            </h4>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {selectedTrigger?.eventName || "event_name"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {selectedTrigger?.description?.trim() || "Fires when this event occurs."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AutomationStepEditorPageProps {
  step: EditableAutomationStep;
  triggerOptions: AutomationTriggerDefinition[];
  templateOptions: AutomationTemplateOption[];
  conditionStepTargets: Array<{ id: string; label: string }>;
  onBack: () => void;
  onSave: (step: EditableAutomationStep) => void;
  onDelete: () => void;
}

const CONDITION_OPERATOR_LABELS: Record<TriggerConditionOperator, string> = {
  equals: "Equals",
  not_equals: "Does not equal",
  contains: "Contains",
  exists: "Exists",
  greater_than: "Greater than",
  less_than: "Less than",
};

const DEFAULT_OPERATORS_BY_TYPE: Record<
  TriggerConditionFieldType,
  TriggerConditionOperator[]
> = {
  string: ["equals", "not_equals", "contains", "exists"],
  number: ["equals", "not_equals", "greater_than", "less_than", "exists"],
  boolean: ["equals", "not_equals", "exists"],
  datetime: ["equals", "not_equals", "greater_than", "less_than", "exists"],
  enum: ["equals", "not_equals", "contains", "exists"],
};

interface ConditionFieldOption {
  key: string;
  label: string;
  type: TriggerConditionFieldType;
  operators: TriggerConditionOperator[];
  enumValues?: string[];
}

const toConditionFieldOption = (
  field: TriggerConditionSchemaField,
): ConditionFieldOption => ({
  key: field.key,
  label: field.label?.trim() || field.key,
  type: field.type,
  operators:
    Array.isArray(field.operators) && field.operators.length > 0
      ? field.operators
      : DEFAULT_OPERATORS_BY_TYPE[field.type],
  enumValues:
    Array.isArray(field.enumValues) && field.enumValues.length > 0
      ? field.enumValues
      : undefined,
});

const getConditionFieldsForTrigger = (
  trigger: AutomationTriggerDefinition | null,
): ConditionFieldOption[] => {
  if (!trigger) return [];

  if (Array.isArray(trigger.conditionSchema) && trigger.conditionSchema.length > 0) {
    return trigger.conditionSchema.map(toConditionFieldOption);
  }

  return (trigger.conditionFields || []).map((field) => ({
    key: field,
    label: field,
    type: "string",
    operators: DEFAULT_OPERATORS_BY_TYPE.string,
  }));
};

const CTA_TYPE_OPTIONS = [
  { value: "none", label: "No CTA", needsValue: false },
  { value: "open_url", label: "Open URL", needsValue: true },
  { value: "view_details", label: "View Details", needsValue: true },
  { value: "dismiss", label: "Dismiss", needsValue: false },
  { value: "mark_read", label: "Mark as Read", needsValue: false },
] as const;

type CtaType = (typeof CTA_TYPE_OPTIONS)[number]["value"];

const getCtaValuePlaceholder = (ctaType: CtaType) => {
  switch (ctaType) {
    case "open_url":
      return "https://...";
    case "view_details":
      return "detail-id or deep link";
    default:
      return "Not required";
  }
};

const ctaNeedsValue = (type: CtaType): boolean =>
  Boolean(CTA_TYPE_OPTIONS.find((option) => option.value === type)?.needsValue);

export function AutomationStepEditorPage({
  step,
  triggerOptions,
  templateOptions,
  conditionStepTargets,
  onBack,
  onSave,
  onDelete,
}: AutomationStepEditorPageProps) {
  const kind = getStepEditorKind(step);
  const config = useMemo(() => toConfigRecord(step.config), [step.config]);

  const [label, setLabel] = useState(
    step.label ||
      (kind === "delay"
        ? "Delay"
        : kind === "condition"
          ? "If Condition"
          : "Send Notification"),
  );
  const [description, setDescription] = useState(step.description || "");

  const [templateId, setTemplateId] = useState(getStringConfig(config, "templateId"));
  const [title, setTitle] = useState(getStringConfig(config, "title"));
  const [subtitle, setSubtitle] = useState(getStringConfig(config, "subtitle"));
  const [body, setBody] = useState(getStringConfig(config, "body"));
  const [image, setImage] = useState(getStringConfig(config, "image"));

  const [ctaType, setCtaType] = useState(
    (getStringConfig(config, "ctaType") || "none") as CtaType,
  );
  const [ctaLabel, setCtaLabel] = useState(getStringConfig(config, "ctaLabel"));
  const [ctaValue, setCtaValue] = useState(getStringConfig(config, "ctaValue"));
  const [ctaTypeSecondary, setCtaTypeSecondary] = useState(
    (getStringConfig(config, "ctaTypeSecondary") || "none") as CtaType,
  );
  const [ctaLabelSecondary, setCtaLabelSecondary] = useState(
    getStringConfig(config, "ctaLabelSecondary"),
  );
  const [ctaValueSecondary, setCtaValueSecondary] = useState(
    getStringConfig(config, "ctaValueSecondary"),
  );
  const [showSecondaryCta, setShowSecondaryCta] = useState(
    Boolean(getStringConfig(config, "ctaTypeSecondary")) &&
      getStringConfig(config, "ctaTypeSecondary") !== "none",
  );
  const [showSubtitle, setShowSubtitle] = useState(
    Boolean(getStringConfig(config, "subtitle")),
  );

  const [waitDays, setWaitDays] = useState(String(getNumberConfig(config, "waitDays")));
  const [waitHours, setWaitHours] = useState(
    String(getNumberConfig(config, "waitHours")),
  );
  const [waitMinutes, setWaitMinutes] = useState(
    String(getNumberConfig(config, "waitMinutes")),
  );

  const [conditionTriggerEvent, setConditionTriggerEvent] = useState(
    getStringConfig(config, "triggerEvent") || triggerOptions[0]?.eventName || "",
  );
  const [conditionField, setConditionField] = useState(getStringConfig(config, "field"));
  const [conditionOperator, setConditionOperator] = useState<TriggerConditionOperator>(() => {
    const configured = getStringConfig(config, "operator") as TriggerConditionOperator;
    if (configured && CONDITION_OPERATOR_LABELS[configured]) {
      return configured;
    }
    return "equals";
  });
  const [conditionValue, setConditionValue] = useState(
    getScalarConfig(config, "value"),
  );
  const [conditionOnTrue, setConditionOnTrue] = useState(
    getStringConfig(config, "onTrue") || "continue",
  );
  const [conditionOnFalse, setConditionOnFalse] = useState(
    getStringConfig(config, "onFalse") || "stop",
  );

  const [error, setError] = useState("");

  const durationLabel = useMemo(() => {
    return formatDurationLabel(
      parseDurationPart(waitDays),
      parseDurationPart(waitHours),
      parseDurationPart(waitMinutes),
    );
  }, [waitDays, waitHours, waitMinutes]);

  const conditionTrigger = useMemo(
    () =>
      triggerOptions.find((option) => option.eventName === conditionTriggerEvent) ||
      null,
    [conditionTriggerEvent, triggerOptions],
  );

  const availableConditionFields = useMemo(
    () => getConditionFieldsForTrigger(conditionTrigger),
    [conditionTrigger],
  );

  const selectedConditionField = useMemo(
    () =>
      availableConditionFields.find((fieldOption) => fieldOption.key === conditionField) ||
      null,
    [availableConditionFields, conditionField],
  );

  const availableConditionOperators = useMemo(() => {
    if (selectedConditionField?.operators?.length) {
      return selectedConditionField.operators;
    }
    return DEFAULT_OPERATORS_BY_TYPE.string;
  }, [selectedConditionField]);

  const templateLabelById = useMemo(
    () => new Map(templateOptions.map((template) => [template.id, template.label])),
    [templateOptions],
  );

  const handleSave = () => {
    const nextLabel = label.trim();
    const nextDescription = description.trim();

    if (kind === "delay") {
      const nextWaitDays = parseDurationPart(waitDays);
      const nextWaitHours = parseDurationPart(waitHours);
      const nextWaitMinutes = parseDurationPart(waitMinutes);

      if (nextWaitDays === 0 && nextWaitHours === 0 && nextWaitMinutes === 0) {
        setError("Duration must be greater than 0.");
        return;
      }

      const nextConfig: Record<string, unknown> = {
        ...config,
        waitDays: nextWaitDays,
        waitHours: nextWaitHours,
        waitMinutes: nextWaitMinutes,
      };

      setError("");
      onSave({
        ...step,
        type: "delay",
        label: nextLabel || `Delay ${durationLabel}`,
        description: nextDescription || "Wait before next step",
        color: "bg-amber-500",
        config: nextConfig,
      });
      return;
    }

    if (kind === "condition") {
      const nextTriggerEvent = conditionTriggerEvent.trim();
      const nextConditionField = conditionField.trim();
      const nextConditionOperator =
        (conditionOperator.trim() as TriggerConditionOperator) || "equals";
      const nextConditionValue = conditionValue.trim();
      const nextOnTrue = conditionOnTrue.trim() || "continue";
      const nextOnFalse = conditionOnFalse.trim() || "stop";
      const branchValues = new Set([
        "continue",
        "stop",
        ...conditionStepTargets.map((target) => target.id),
      ]);

      if (!nextTriggerEvent) {
        setError("Condition trigger is required.");
        return;
      }
      if (!nextConditionField) {
        setError("Condition field is required.");
        return;
      }
      if (
        availableConditionFields.length > 0 &&
        !availableConditionFields.some(
          (fieldOption) => fieldOption.key === nextConditionField,
        )
      ) {
        setError("Condition field must be selected from the trigger schema.");
        return;
      }
      if (!availableConditionOperators.includes(nextConditionOperator)) {
        setError("Condition operator must be selected from allowed operators.");
        return;
      }
      if (!branchValues.has(nextOnTrue) || !branchValues.has(nextOnFalse)) {
        setError("Condition branch target is invalid.");
        return;
      }
      if (nextConditionOperator !== "exists" && !nextConditionValue) {
        setError("Condition value is required for this operator.");
        return;
      }

      const nextConfig: Record<string, unknown> = {
        ...config,
        triggerEvent: nextTriggerEvent,
        field: nextConditionField,
        operator: nextConditionOperator,
        onTrue: nextOnTrue,
        onFalse: nextOnFalse,
      };

      if (nextConditionOperator === "exists") {
        delete nextConfig.value;
      } else {
        if (selectedConditionField?.type === "number") {
          const parsed = Number(nextConditionValue);
          nextConfig.value = Number.isFinite(parsed) ? parsed : nextConditionValue;
        } else if (selectedConditionField?.type === "boolean") {
          nextConfig.value = nextConditionValue === "true";
        } else {
          nextConfig.value = nextConditionValue;
        }
      }

      setError("");
      onSave({
        ...step,
        type: "condition",
        label:
          nextLabel ||
          `If ${nextConditionField} ${nextConditionOperator.replaceAll("_", " ")}`,
        description:
          nextDescription ||
          `Evaluate trigger ${conditionTrigger?.name || nextTriggerEvent}`,
        color: "bg-slate-500",
        config: nextConfig,
      });
      return;
    }

    const nextTemplateId = templateId.trim();
    const nextTitle = title.trim();
    const nextSubtitle = subtitle.trim();
    const nextBody = body.trim();
    const nextImage = image.trim();

    if (!nextTemplateId && !nextTitle && !nextBody) {
      setError("Provide a template or a title/body for this notification.");
      return;
    }

    const ctaCandidates = [
      {
        type: ctaType,
        label: ctaLabel.trim(),
        value: ctaValue.trim(),
        needsValue: ctaNeedsValue(ctaType),
        dataSuffix: "",
      },
      ...(showSecondaryCta
        ? [
            {
              type: ctaTypeSecondary,
              label: ctaLabelSecondary.trim(),
              value: ctaValueSecondary.trim(),
              needsValue: ctaNeedsValue(ctaTypeSecondary),
              dataSuffix: "Secondary",
            },
          ]
        : []),
    ];

    const nextConfig: Record<string, unknown> = { ...config };

    if (nextTemplateId) nextConfig.templateId = nextTemplateId;
    else delete nextConfig.templateId;

    if (nextTitle) nextConfig.title = nextTitle;
    else delete nextConfig.title;

    if (showSubtitle && nextSubtitle) nextConfig.subtitle = nextSubtitle;
    else delete nextConfig.subtitle;

    if (nextBody) nextConfig.body = nextBody;
    else delete nextConfig.body;

    if (nextImage) nextConfig.image = nextImage;
    else delete nextConfig.image;

    const ctaData: Record<string, string> = {};
    for (const cta of ctaCandidates) {
      if (cta.type !== "none") {
        ctaData[`ctaType${cta.dataSuffix}`] = cta.type;
      }
      if (cta.label) {
        ctaData[`ctaLabel${cta.dataSuffix}`] = cta.label;
      }
      if (cta.needsValue && cta.value) {
        ctaData[`ctaValue${cta.dataSuffix}`] = cta.value;
      }
    }

    const actions = ctaCandidates
      .filter((cta) => cta.type !== "none" && cta.label)
      .map((cta) => ({
        action: cta.type,
        title: cta.label,
        ...(cta.needsValue && cta.value ? { url: cta.value } : {}),
      }));

    if (Object.keys(ctaData).length > 0) {
      nextConfig.data = ctaData;
    } else {
      delete nextConfig.data;
    }

    if (actions.length > 0) {
      nextConfig.actions = actions;
    } else {
      delete nextConfig.actions;
    }

    nextConfig.ctaType = ctaType;
    nextConfig.ctaLabel = ctaLabel.trim();
    nextConfig.ctaValue = ctaValue.trim();

    if (showSecondaryCta) {
      nextConfig.ctaTypeSecondary = ctaTypeSecondary;
      nextConfig.ctaLabelSecondary = ctaLabelSecondary.trim();
      nextConfig.ctaValueSecondary = ctaValueSecondary.trim();
    } else {
      delete nextConfig.ctaTypeSecondary;
      delete nextConfig.ctaLabelSecondary;
      delete nextConfig.ctaValueSecondary;
    }

    const primaryActionUrl = actions.find(
      (action) => action.action === "open_url" && Boolean(action.url),
    )?.url;
    if (primaryActionUrl) {
      nextConfig.actionUrl = primaryActionUrl;
    } else {
      delete nextConfig.actionUrl;
    }

    setError("");
    onSave({
      ...step,
      type: "notification",
      label:
        nextLabel ||
        (nextTemplateId
          ? `Send ${templateLabelById.get(nextTemplateId) || "Template"}`
          : "Send Notification"),
      description: nextDescription || "Dispatch a push notification",
      color: "bg-purple-500",
      config: nextConfig,
    });
  };

  const notificationPreview =
    body.trim() || description.trim() || "Dispatch a push notification";

  const getBranchLabel = (target: string) => {
    if (target === "continue") return "Continue";
    if (target === "stop") return "Stop workflow";
    const option = conditionStepTargets.find((stepTarget) => stepTarget.id === target);
    return option ? `Jump to ${option.label}` : target;
  };

  const conditionPreviewBase =
    conditionOperator === "exists"
      ? `${conditionField || "field"} exists`
      : `${conditionField || "field"} ${conditionOperator.replaceAll("_", " ")} ${conditionValue || "value"}`;

  const conditionPreview = `${conditionPreviewBase} | True: ${getBranchLabel(
    conditionOnTrue,
  )} | False: ${getBranchLabel(conditionOnFalse)}`;

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-3xl border bg-white shadow-sm">
      <header className="flex items-center justify-between border-b px-8 py-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
            <ArrowLeft size={20} />
          </Button>
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-xl text-white",
                kind === "delay"
                  ? "bg-amber-500"
                  : kind === "condition"
                    ? "bg-slate-600"
                    : "bg-purple-500",
              )}
            >
              {kind === "delay" ? (
                <Clock3 size={18} />
              ) : kind === "condition" ? (
                <Filter size={18} />
              ) : (
                <Bell size={18} />
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {kind === "delay"
                  ? "Delay Step"
                  : kind === "condition"
                    ? "Condition Step"
                    : "Notification Step"}
              </p>
              <h3 className="text-xl font-bold text-slate-900">Edit Step</h3>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onDelete}
            className="h-10 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 size={16} className="me-2" />
            Delete Step
          </Button>
          <Button
            onClick={handleSave}
            className="h-10 rounded-xl bg-blue-600 px-6 hover:bg-blue-700"
          >
            <Save size={16} className="me-2" />
            Save Step
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-8 overflow-y-auto p-8 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Step Label</label>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:border-blue-300 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Description</label>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={
                  kind === "delay"
                    ? "Wait before next step"
                    : kind === "condition"
                      ? "Evaluate condition"
                      : "Dispatch a push notification"
                }
                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:border-blue-300 focus:outline-none"
              />
            </div>
          </div>

          {kind === "delay" ? (
            <div className="space-y-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
              <p className="text-sm font-semibold text-amber-900">Duration</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-700">
                    Days
                  </span>
                  <input
                    value={waitDays}
                    onChange={(event) =>
                      setWaitDays(event.target.value.replace(/[^\d]/g, ""))
                    }
                    className="h-11 w-full rounded-xl border border-amber-200 px-4 text-sm focus:border-amber-300 focus:outline-none"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-700">
                    Hours
                  </span>
                  <input
                    value={waitHours}
                    onChange={(event) =>
                      setWaitHours(event.target.value.replace(/[^\d]/g, ""))
                    }
                    className="h-11 w-full rounded-xl border border-amber-200 px-4 text-sm focus:border-amber-300 focus:outline-none"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-700">
                    Minutes
                  </span>
                  <input
                    value={waitMinutes}
                    onChange={(event) =>
                      setWaitMinutes(event.target.value.replace(/[^\d]/g, ""))
                    }
                    className="h-11 w-full rounded-xl border border-amber-200 px-4 text-sm focus:border-amber-300 focus:outline-none"
                  />
                </label>
              </div>
              <p className="text-sm text-amber-800">
                Total delay: <strong>{durationLabel}</strong>
              </p>
            </div>
          ) : null}

          {kind === "condition" ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-800">If Statement</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                    Trigger
                  </label>
                  <select
                    value={conditionTriggerEvent}
                    onChange={(event) => {
                      const nextTriggerEvent = event.target.value;
                      setConditionTriggerEvent(nextTriggerEvent);

                      const nextTrigger =
                        triggerOptions.find(
                          (triggerOption) =>
                            triggerOption.eventName === nextTriggerEvent,
                        ) || null;
                      const nextFields = getConditionFieldsForTrigger(nextTrigger);
                      const nextField = nextFields[0] || null;

                      setConditionField(nextField?.key || "");
                      setConditionOperator(
                        nextField?.operators?.[0] || "equals",
                      );

                      if (nextField?.type === "boolean") {
                        setConditionValue("true");
                      } else if (nextField?.type === "enum") {
                        setConditionValue(nextField.enumValues?.[0] || "");
                      } else {
                        setConditionValue("");
                      }
                    }}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                  >
                    <option value="">Select trigger</option>
                    {triggerOptions.map((triggerOption) => (
                      <option key={triggerOption.id} value={triggerOption.eventName}>
                        {triggerOption.name} ({triggerOption.eventName})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                    Field
                  </label>
                  <select
                    value={conditionField}
                    onChange={(event) => {
                      const nextFieldKey = event.target.value;
                      setConditionField(nextFieldKey);

                      const nextField =
                        availableConditionFields.find(
                          (fieldOption) => fieldOption.key === nextFieldKey,
                        ) || null;

                      if (!nextField) return;

                      const nextOperators =
                        nextField.operators.length > 0
                          ? nextField.operators
                          : DEFAULT_OPERATORS_BY_TYPE[nextField.type];
                      if (!nextOperators.includes(conditionOperator)) {
                        setConditionOperator(nextOperators[0] || "equals");
                      }

                      if (nextField.type === "boolean") {
                        setConditionValue("true");
                      } else if (nextField.type === "enum") {
                        setConditionValue(nextField.enumValues?.[0] || "");
                      } else if (nextField.type === "number") {
                        setConditionValue("0");
                      } else {
                        setConditionValue("");
                      }
                    }}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                  >
                    <option value="">Select field</option>
                    {availableConditionFields.map((fieldOption) => (
                      <option key={fieldOption.key} value={fieldOption.key}>
                        {fieldOption.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                    Operator
                  </label>
                  <select
                    value={conditionOperator}
                    onChange={(event) =>
                      setConditionOperator(
                        event.target.value as TriggerConditionOperator,
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                  >
                    {availableConditionOperators.map((operator) => (
                      <option key={operator} value={operator}>
                        {CONDITION_OPERATOR_LABELS[operator]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                    Value
                  </label>
                  {conditionOperator === "exists" ? (
                    <input
                      value=""
                      disabled
                      placeholder="Not required for 'exists'"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm disabled:bg-slate-100"
                    />
                  ) : selectedConditionField?.type === "boolean" ? (
                    <select
                      value={conditionValue || "true"}
                      onChange={(event) => setConditionValue(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : selectedConditionField?.type === "enum" &&
                    selectedConditionField.enumValues?.length ? (
                    <select
                      value={conditionValue}
                      onChange={(event) => setConditionValue(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                    >
                      {selectedConditionField.enumValues.map((enumValue) => (
                        <option key={enumValue} value={enumValue}>
                          {enumValue}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={conditionValue}
                      onChange={(event) => setConditionValue(event.target.value)}
                      type={selectedConditionField?.type === "number" ? "number" : "text"}
                      placeholder="Expected value"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm disabled:bg-slate-100"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                    If True
                  </label>
                  <select
                    value={conditionOnTrue}
                    onChange={(event) => setConditionOnTrue(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                  >
                    <option value="continue">Continue to next step</option>
                    <option value="stop">Stop workflow</option>
                    {conditionStepTargets.map((stepTarget) => (
                      <option key={`true-${stepTarget.id}`} value={stepTarget.id}>
                        Jump to {stepTarget.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                    If False
                  </label>
                  <select
                    value={conditionOnFalse}
                    onChange={(event) => setConditionOnFalse(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                  >
                    <option value="stop">Stop workflow</option>
                    <option value="continue">Continue to next step</option>
                    {conditionStepTargets.map((stepTarget) => (
                      <option key={`false-${stepTarget.id}`} value={stepTarget.id}>
                        Jump to {stepTarget.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {kind === "notification" ? (
            <div className="space-y-4 rounded-2xl border border-purple-100 bg-purple-50/40 p-5">
              <p className="text-sm font-semibold text-purple-900">
                Notification Content
              </p>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-purple-700">
                  Template
                </label>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-purple-200 px-4 text-sm focus:border-purple-300 focus:outline-none"
                >
                  <option value="">No template (manual content)</option>
                  {templateOptions.map((templateOption) => (
                    <option key={templateOption.id} value={templateOption.id}>
                      {templateOption.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-widest text-purple-700">
                    Title
                  </label>
                  {!showSubtitle ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"
                      onClick={() => setShowSubtitle(true)}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add subtitle
                    </button>
                  ) : null}
                </div>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Welcome to NotifyX"
                  className="h-11 w-full rounded-xl border border-purple-200 px-4 text-sm focus:border-purple-300 focus:outline-none"
                />
              </div>
              {showSubtitle ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-purple-700">
                    Subtitle
                  </label>
                  <input
                    value={subtitle}
                    onChange={(event) => setSubtitle(event.target.value)}
                    placeholder="Optional subtitle"
                    className="h-11 w-full rounded-xl border border-purple-200 px-4 text-sm focus:border-purple-300 focus:outline-none"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-purple-700">
                  Body
                </label>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={4}
                  placeholder="Message body shown to the user."
                  className="w-full rounded-xl border border-purple-200 px-4 py-3 text-sm focus:border-purple-300 focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-widest text-purple-700">
                  Image URL
                </label>
                <input
                  value={image}
                  onChange={(event) => setImage(event.target.value)}
                  placeholder="https://example.com/image.png"
                  className="h-11 w-full rounded-xl border border-purple-200 px-4 text-sm focus:border-purple-300 focus:outline-none"
                />
              </div>

              <div className="space-y-4 rounded-xl border border-purple-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-purple-700">
                  CTA Buttons
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-600">CTA Type</label>
                    <select
                      value={ctaType}
                      onChange={(event) => setCtaType(event.target.value as CtaType)}
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                    >
                      {CTA_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-600">CTA Label</label>
                    <input
                      value={ctaLabel}
                      onChange={(event) => setCtaLabel(event.target.value)}
                      placeholder="Open"
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-600">CTA Value</label>
                    <input
                      value={ctaValue}
                      onChange={(event) => setCtaValue(event.target.value)}
                      disabled={!ctaNeedsValue(ctaType)}
                      placeholder={getCtaValuePlaceholder(ctaType)}
                      className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {showSecondaryCta ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">
                        Secondary CTA
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSecondaryCta(false);
                          setCtaTypeSecondary("none");
                          setCtaLabelSecondary("");
                          setCtaValueSecondary("");
                        }}
                        className="text-xs font-semibold text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <select
                        value={ctaTypeSecondary}
                        onChange={(event) =>
                          setCtaTypeSecondary(event.target.value as CtaType)
                        }
                        className="h-11 rounded-xl border border-slate-200 px-4 text-sm"
                      >
                        {CTA_TYPE_OPTIONS.map((option) => (
                          <option key={`secondary-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={ctaLabelSecondary}
                        onChange={(event) => setCtaLabelSecondary(event.target.value)}
                        placeholder="Learn more"
                        className="h-11 rounded-xl border border-slate-200 px-4 text-sm"
                      />
                      <input
                        value={ctaValueSecondary}
                        onChange={(event) => setCtaValueSecondary(event.target.value)}
                        disabled={!ctaNeedsValue(ctaTypeSecondary)}
                        placeholder={getCtaValuePlaceholder(ctaTypeSecondary)}
                        className="h-11 rounded-xl border border-slate-200 px-4 text-sm disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSecondaryCta(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add second CTA button
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6">
            <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <Sparkles size={12} />
              Step Preview
            </p>
            <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {kind === "delay"
                  ? "Delay"
                  : kind === "condition"
                    ? "Condition"
                    : "Notification"}
              </p>
              <h4 className="mt-2 text-lg font-bold text-slate-900">
                {label.trim() ||
                  (kind === "delay"
                    ? "Delay"
                    : kind === "condition"
                      ? "If Condition"
                      : "Send Notification")}
              </h4>
              <p className="mt-2 text-sm text-slate-600">
                {kind === "delay"
                  ? `Wait ${durationLabel} before the next step.`
                  : kind === "condition"
                    ? conditionPreview
                    : notificationPreview}
              </p>
              {kind === "condition" ? (
                <p className="mt-2 text-xs text-slate-500">
                  Trigger: {conditionTrigger?.name || conditionTriggerEvent || "-"}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
