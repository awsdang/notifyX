import { Select } from "./ui/Input";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  FlaskConical,
  GripVertical,
  Hash,
  Pencil,
  Plus,
  Save,
  ToggleLeft,
  Trash2,
  Type,
  Calendar,
  List,
  CheckCircle2,
  XCircle,
  Zap,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/EmptyState";
import type {
  AutomationTriggerDefinition,
  TriggerConditionFieldType,
  TriggerConditionOperator,
  TriggerConditionSchemaField,
} from "../hooks/useAutomationTriggers";

interface TriggerTestResult {
  triggerId: string;
  eventName: string;
  matchedAutomations: number;
  spawnedExecutions: number;
}

interface AutomationTriggersPageProps {
  appId: string;
  appName?: string;
  triggers: AutomationTriggerDefinition[];
  isLoading: boolean;
  createTrigger: (payload: {
    name: string;
    eventName: string;
    description?: string | null;
    conditionFields?: string[];
    conditionSchema?: TriggerConditionSchemaField[];
    payloadExample?: Record<string, unknown> | null;
    isActive?: boolean;
  }) => Promise<AutomationTriggerDefinition>;
  updateTrigger: (
    id: string,
    payload: Partial<AutomationTriggerDefinition>,
  ) => Promise<AutomationTriggerDefinition>;
  deleteTrigger: (id: string) => Promise<void>;
  testTrigger: (
    id: string,
    payload: {
      externalUserId?: string;
      payload?: Record<string, unknown>;
      priority?: "LOW" | "NORMAL" | "HIGH";
    },
  ) => Promise<TriggerTestResult>;
}

const FIELD_TYPE_LABELS: Record<TriggerConditionFieldType, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  datetime: "Datetime",
  enum: "Enum",
};

const FIELD_TYPE_ICONS: Record<TriggerConditionFieldType, typeof Type> = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  datetime: Calendar,
  enum: List,
};

const OPERATOR_LABELS: Record<TriggerConditionOperator, string> = {
  equals: "=",
  not_equals: "!=",
  contains: "contains",
  exists: "exists",
  greater_than: ">",
  less_than: "<",
};

const OPERATOR_LONG_LABELS: Record<TriggerConditionOperator, string> = {
  equals: "Equals",
  not_equals: "Not equals",
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

interface EditableSchemaField {
  id: string;
  key: string;
  label: string;
  type: TriggerConditionFieldType;
  operators: TriggerConditionOperator[];
  enumValues: string;
  required: boolean;
  collapsed: boolean;
}

const createFieldId = () =>
  `field-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const toPayloadExampleInput = (trigger?: AutomationTriggerDefinition | null): string => {
  if (!trigger?.payloadExample || typeof trigger.payloadExample !== "object") {
    return '{\n  "key": "value"\n}';
  }

  return JSON.stringify(trigger.payloadExample, null, 2);
};

const toSchemaEditorRows = (
  trigger?: AutomationTriggerDefinition | null,
): EditableSchemaField[] => {
  if (!trigger?.conditionSchema?.length) {
    if (trigger?.conditionFields?.length) {
      return trigger.conditionFields.map((field) => ({
        id: createFieldId(),
        key: field,
        label: "",
        type: "string" as const,
        operators: DEFAULT_OPERATORS_BY_TYPE.string,
        enumValues: "",
        required: false,
        collapsed: false,
      }));
    }

    return [
      {
        id: createFieldId(),
        key: "payload.key",
        label: "",
        type: "string" as const,
        operators: DEFAULT_OPERATORS_BY_TYPE.string,
        enumValues: "",
        required: false,
        collapsed: false,
      },
    ];
  }

  return trigger.conditionSchema.map((field) => ({
    id: createFieldId(),
    key: field.key,
    label: field.label || "",
    type: field.type,
    operators:
      field.operators?.length > 0
        ? field.operators
        : DEFAULT_OPERATORS_BY_TYPE[field.type],
    enumValues: (field.enumValues || []).join(", "),
    required: Boolean(field.required),
    collapsed: false,
  }));
};

const parsePayloadExample = (value: string): Record<string, unknown> | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload example must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
};

const toSchemaPayload = (
  rows: EditableSchemaField[],
): TriggerConditionSchemaField[] => {
  const payload: TriggerConditionSchemaField[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      continue;
    }

    if (seen.has(key)) {
      throw new Error(`Duplicate schema field key: ${key}`);
    }
    seen.add(key);

    const operators = row.operators.length > 0
      ? row.operators
      : DEFAULT_OPERATORS_BY_TYPE[row.type];

    const enumValues =
      row.type === "enum"
        ? row.enumValues
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

    if (row.type === "enum" && enumValues.length === 0) {
      throw new Error(`Enum field "${key}" needs at least one enum value.`);
    }

    payload.push({
      key,
      label: row.label.trim() || undefined,
      type: row.type,
      operators,
      enumValues: enumValues.length > 0 ? enumValues : undefined,
      required: row.required,
    });
  }

  if (payload.length === 0) {
    throw new Error("At least one condition schema field is required.");
  }

  return payload;
};

// --- Snippet generation helpers ---

type SnippetLang = "curl" | "node" | "python";

function generateSnippet(
  lang: SnippetLang,
  appId: string,
  eventName: string,
): string {
  if (lang === "curl") {
    return `curl -X POST "$NOTIFYX_URL/api/v1/events/${eventName}" \\
  -H "X-API-Key: $NOTIFYX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "${appId}",
    "externalUserId": "user_123",
    "payload": {
      "key": "value"
    }
  }'`;
  }

  if (lang === "node") {
    return `const response = await fetch(
  \`\${process.env.NOTIFYX_URL}/api/v1/events/${eventName}\`,
  {
    method: "POST",
    headers: {
      "X-API-Key": process.env.NOTIFYX_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appId: "${appId}",
      externalUserId: "user_123",
      payload: { key: "value" },
    }),
  }
);`;
  }

  // python
  return `import requests

response = requests.post(
    f"{NOTIFYX_URL}/api/v1/events/${eventName}",
    headers={
        "X-API-Key": NOTIFYX_API_KEY,
        "Content-Type": "application/json",
    },
    json={
        "appId": "${appId}",
        "externalUserId": "user_123",
        "payload": {"key": "value"},
    },
)`;
}

// --- Toggle switch component ---

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-3"
    >
      <span
        className={clsx(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          checked ? "bg-emerald-500" : "bg-slate-200",
        )}
      >
        <span
          className={clsx(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </button>
  );
}

// --- Test modal component ---

function TestModal({
  trigger,
  testExternalUserId,
  setTestExternalUserId,
  testPayload,
  setTestPayload,
  isTesting,
  testResult,
  testError,
  onRun,
  onClose,
}: {
  trigger: AutomationTriggerDefinition;
  testExternalUserId: string;
  setTestExternalUserId: (v: string) => void;
  testPayload: string;
  setTestPayload: (v: string) => void;
  isTesting: boolean;
  testResult: TriggerTestResult | null;
  testError: string | null;
  onRun: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Test Trigger</h3>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{trigger.eventName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">External User ID</span>
            <input
              value={testExternalUserId}
              onChange={(e) => setTestExternalUserId(e.target.value)}
              placeholder="demo-user-123"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-sm focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Payload JSON</span>
            <textarea
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {testResult && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">
                  {testResult.matchedAutomations} automation{testResult.matchedAutomations !== 1 ? "s" : ""} matched
                </p>
                <p className="mt-0.5 text-xs text-emerald-600">
                  {testResult.spawnedExecutions} execution{testResult.spawnedExecutions !== 1 ? "s" : ""} spawned
                </p>
              </div>
            </div>
          )}

          {testError && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <XCircle size={18} className="mt-0.5 shrink-0 text-rose-600" />
              <p className="text-sm text-rose-700">{testError}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onRun} disabled={isTesting}>
            <FlaskConical size={15} className="me-1.5" />
            {isTesting ? "Running..." : "Run Test"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Main component ---

export function AutomationTriggersPage({
  appId,
  appName,
  triggers,
  isLoading,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  testTrigger,
}: AutomationTriggersPageProps) {
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(
    triggers[0]?.id || null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState("");
  const [payloadExample, setPayloadExample] = useState('{\n  "key": "value"\n}');
  const [isActive, setIsActive] = useState(true);
  const [schemaFields, setSchemaFields] = useState<EditableSchemaField[]>(() =>
    toSchemaEditorRows(null),
  );

  const [testExternalUserId, setTestExternalUserId] = useState("demo-user-123");
  const [testPayload, setTestPayload] = useState('{\n  "key": "value"\n}');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TriggerTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testingTriggerId, setTestingTriggerId] = useState<string | null>(null);
  const [snippetLang, setSnippetLang] = useState<SnippetLang>("curl");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const selectedTrigger = useMemo(
    () => triggers.find((trigger) => trigger.id === selectedTriggerId) || null,
    [selectedTriggerId, triggers],
  );

  useEffect(() => {
    if (!selectedTriggerId && triggers.length > 0) {
      setSelectedTriggerId(triggers[0].id);
      return;
    }

    if (
      selectedTriggerId &&
      !triggers.some((trigger) => trigger.id === selectedTriggerId)
    ) {
      setSelectedTriggerId(triggers[0]?.id || null);
    }
  }, [selectedTriggerId, triggers]);

  const docsTrigger = selectedTrigger || triggers[0] || null;

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setEventName("");
    setDescription("");
    setPayloadExample('{\n  "key": "value"\n}');
    setIsActive(true);
    setSchemaFields(toSchemaEditorRows(null));
    setFormError(null);
  };

  const startCreate = () => {
    resetForm();
  };

  const startEdit = (trigger: AutomationTriggerDefinition) => {
    setSelectedTriggerId(trigger.id);
    setEditingId(trigger.id);
    setName(trigger.name || "");
    setEventName(trigger.eventName || "");
    setDescription(trigger.description || "");
    setPayloadExample(toPayloadExampleInput(trigger));
    setIsActive(trigger.isActive);
    setSchemaFields(toSchemaEditorRows(trigger));
    setFormError(null);
  };

  const addSchemaField = () => {
    setSchemaFields((current) => [
      ...current,
      {
        id: createFieldId(),
        key: "",
        label: "",
        type: "string",
        operators: DEFAULT_OPERATORS_BY_TYPE.string,
        enumValues: "",
        required: false,
        collapsed: false,
      },
    ]);
  };

  const updateSchemaField = (
    fieldId: string,
    patch: Partial<EditableSchemaField>,
  ) => {
    setSchemaFields((current) =>
      current.map((field) => {
        if (field.id !== fieldId) return field;

        const next = { ...field, ...patch };
        if (patch.type && patch.type !== field.type) {
          next.operators = DEFAULT_OPERATORS_BY_TYPE[patch.type];
          if (patch.type !== "enum") {
            next.enumValues = "";
          }
        }

        return next;
      }),
    );
  };

  const toggleFieldCollapsed = (fieldId: string) => {
    setSchemaFields((current) =>
      current.map((field) =>
        field.id === fieldId ? { ...field, collapsed: !field.collapsed } : field,
      ),
    );
  };

  const toggleOperator = (
    fieldId: string,
    operator: TriggerConditionOperator,
  ) => {
    setSchemaFields((current) =>
      current.map((field) => {
        if (field.id !== fieldId) return field;

        const hasOperator = field.operators.includes(operator);
        const nextOperators = hasOperator
          ? field.operators.filter((item) => item !== operator)
          : [...field.operators, operator];

        return {
          ...field,
          operators:
            nextOperators.length > 0
              ? nextOperators
              : DEFAULT_OPERATORS_BY_TYPE[field.type],
        };
      }),
    );
  };

  const removeSchemaField = (fieldId: string) => {
    setSchemaFields((current) =>
      current.filter((field) => field.id !== fieldId),
    );
  };

  const saveTrigger = async () => {
    const normalizedName = name.trim();
    const normalizedEventName = eventName.trim();

    if (!normalizedName || !normalizedEventName) {
      setFormError("Trigger name and event name are required.");
      return;
    }

    let parsedPayload: Record<string, unknown> | null = null;
    let parsedSchema: TriggerConditionSchemaField[] = [];
    try {
      parsedPayload = parsePayloadExample(payloadExample);
      parsedSchema = toSchemaPayload(schemaFields);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Invalid trigger schema.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const updated = await updateTrigger(editingId, {
          name: normalizedName,
          eventName: normalizedEventName,
          description: description.trim() || null,
          conditionSchema: parsedSchema,
          conditionFields: parsedSchema.map((field) => field.key),
          payloadExample: parsedPayload,
          isActive,
        });
        setSelectedTriggerId(updated.id);
      } else {
        const created = await createTrigger({
          name: normalizedName,
          eventName: normalizedEventName,
          description: description.trim() || null,
          conditionSchema: parsedSchema,
          conditionFields: parsedSchema.map((field) => field.key),
          payloadExample: parsedPayload,
          isActive,
        });
        setSelectedTriggerId(created.id);
      }

      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save trigger.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeTrigger = async (triggerId: string) => {
    const confirmed = window.confirm(
      "Delete this trigger? Workflows using it must be updated first.",
    );
    if (!confirmed) return;

    try {
      await deleteTrigger(triggerId);
      if (editingId === triggerId) {
        resetForm();
      }
      if (selectedTriggerId === triggerId) {
        setSelectedTriggerId(triggers.find((trigger) => trigger.id !== triggerId)?.id || null);
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to delete trigger.",
      );
    }
  };

  const openTestModal = (trigger: AutomationTriggerDefinition) => {
    setTestingTriggerId(trigger.id);
    setTestResult(null);
    setTestError(null);
  };

  const runTriggerTest = async () => {
    const trigger = triggers.find((t) => t.id === testingTriggerId);
    if (!trigger) return;

    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = (parsePayloadExample(testPayload) || {}) as Record<string, unknown>;
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Invalid test payload JSON.");
      return;
    }

    setIsTesting(trigger.id);
    setTestResult(null);
    setTestError(null);

    try {
      const result = await testTrigger(trigger.id, {
        externalUserId: testExternalUserId.trim() || undefined,
        payload: parsedPayload,
      });
      setTestResult(result);
      setSelectedTriggerId(trigger.id);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Failed to test trigger.");
    } finally {
      setIsTesting(null);
    }
  };

  const copySnippet = useCallback(() => {
    if (!docsTrigger) return;
    const text = generateSnippet(snippetLang, appId, docsTrigger.eventName);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    });
  }, [snippetLang, appId, docsTrigger]);

  const testingTrigger = triggers.find((t) => t.id === testingTriggerId) || null;

  const fieldCount = (t: AutomationTriggerDefinition) =>
    (t.conditionSchema || []).length || (t.conditionFields || []).length;

  return (
    <div className="space-y-6">
      {/* Test modal */}
      {testingTrigger && (
        <TestModal
          trigger={testingTrigger}
          testExternalUserId={testExternalUserId}
          setTestExternalUserId={setTestExternalUserId}
          testPayload={testPayload}
          setTestPayload={setTestPayload}
          isTesting={isTesting === testingTrigger.id}
          testResult={testResult}
          testError={testError}
          onRun={() => void runTriggerTest()}
          onClose={() => setTestingTriggerId(null)}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---- LEFT: Trigger Catalog ---- */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white">
            {/* Catalog header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h4 className="text-base font-semibold text-slate-900">Triggers</h4>
                {!isLoading && triggers.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-bold text-slate-600">
                    {triggers.length}
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={startCreate}>
                <Plus size={14} className="me-1.5" />
                New
              </Button>
            </div>

            {/* Catalog list */}
            <div className="p-2">
              {isLoading ? (
                <div className="space-y-2 p-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                  ))}
                </div>
              ) : triggers.length === 0 ? (
                <div className="px-3 py-6">
                  <EmptyState
                    icon={<Zap size={24} />}
                    title="No triggers yet"
                    description="Create your first trigger to start building event-driven automations."
                    action={{ label: "Create Trigger", onClick: startCreate }}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  {triggers.map((trigger) => {
                    const isSelected = selectedTriggerId === trigger.id;
                    return (
                      <button
                        key={trigger.id}
                        type="button"
                        onClick={() => setSelectedTriggerId(trigger.id)}
                        className={clsx(
                          "group relative w-full rounded-xl px-4 py-3 text-start transition-all",
                          isSelected
                            ? "border-l-2 border-l-blue-500 bg-blue-50/70"
                            : "border-l-2 border-l-transparent hover:bg-slate-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={clsx(
                                  "mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full",
                                  trigger.isActive ? "bg-emerald-500" : "bg-slate-300",
                                )}
                              />
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {trigger.name}
                              </p>
                            </div>
                            <p className="mt-1 truncate pl-4 font-mono text-xs text-slate-500">
                              {trigger.eventName}
                            </p>
                            <p className="mt-0.5 pl-4 text-[11px] text-slate-400">
                              {fieldCount(trigger)} field{fieldCount(trigger) !== 1 ? "s" : ""}
                            </p>
                          </div>

                          {/* Hover actions */}
                          <div className={clsx(
                            "flex shrink-0 items-center gap-0.5 transition-opacity",
                            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                          )}>
                            <button
                              type="button"
                              title="Edit"
                              onClick={(e) => { e.stopPropagation(); startEdit(trigger); }}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              title="Test"
                              onClick={(e) => { e.stopPropagation(); openTestModal(trigger); }}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-sm"
                            >
                              <FlaskConical size={13} />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              onClick={(e) => { e.stopPropagation(); void removeTrigger(trigger.id); }}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---- RIGHT: Editor ---- */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white">
            {/* Editor header */}
            <div className={clsx(
              "flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b px-6 py-4",
              editingId
                ? "border-amber-100 bg-amber-50/50"
                : "border-slate-100 bg-slate-50/50",
            )}>
              <div>
                <h4 className="text-base font-semibold text-slate-900">
                  {editingId ? (
                    <>
                      Editing: <span className="font-mono text-amber-700">{name || "..."}</span>
                    </>
                  ) : (
                    "Create New Trigger"
                  )}
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {editingId
                    ? "Update this trigger definition and its condition schema."
                    : "Define a new event trigger with typed condition fields."}
                </p>
              </div>
              {editingId && (
                <Button variant="outline" size="sm" onClick={resetForm}>
                  <X size={14} className="me-1.5" />
                  Cancel
                </Button>
              )}
            </div>

            <div className="space-y-6 p-6">
              {/* Basic fields */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Trigger Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Order Paid"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm transition-colors focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-[11px] text-slate-400">Human-readable label shown in workflow builders</p>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Event Name</span>
                  <input
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    placeholder="order_paid"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm transition-colors focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <p className="text-[11px] text-slate-400">The event key your backend will fire</p>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Explain when this trigger should fire and what data it carries"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm transition-colors focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              {/* Active toggle */}
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                <ToggleSwitch
                  checked={isActive}
                  onChange={setIsActive}
                  label="Active in workflow builders"
                />
              </div>

              {/* Schema fields */}
              <div className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Condition Schema</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Define typed fields and allowed operators for workflow conditions
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addSchemaField}>
                    <Plus size={14} className="me-1" />
                    Add Field
                  </Button>
                </div>

                <div className="divide-y divide-slate-100">
                  {schemaFields.map((field, index) => {
                    const FieldIcon = FIELD_TYPE_ICONS[field.type];
                    return (
                      <div key={field.id} className="px-4 py-3">
                        {/* Field header row */}
                        <div className="flex items-center gap-2">
                          <GripVertical size={14} className="shrink-0 cursor-grab text-slate-300" />
                          <button
                            type="button"
                            onClick={() => toggleFieldCollapsed(field.id)}
                            className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600"
                          >
                            {field.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <FieldIcon size={14} className="shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700">
                            {field.key || <span className="italic text-slate-300">untitled</span>}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                            {field.type}
                          </span>
                          {field.required && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                              Required
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeSchemaField(field.id)}
                            disabled={schemaFields.length <= 1}
                            className="rounded p-1 text-slate-300 hover:text-rose-500 disabled:opacity-30"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Collapsible body */}
                        {!field.collapsed && (
                          <div className="mt-3 space-y-3 pl-8">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <label className="block space-y-1 md:col-span-2">
                                <span className="text-[11px] font-semibold text-slate-500">Path</span>
                                <input
                                  value={field.key}
                                  onChange={(e) =>
                                    updateSchemaField(field.id, { key: e.target.value })
                                  }
                                  placeholder="payload.total"
                                  className="h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                              </label>
                              <label className="block space-y-1">
                                <span className="text-[11px] font-semibold text-slate-500">Type</span>
                                <div className="relative">
                                  <Select
                                    value={field.type}
                                    onChange={(e) =>
                                      updateSchemaField(field.id, {
                                        type: e.target.value as TriggerConditionFieldType,
                                      })
                                    }
                                    className="h-9 w-full appearance-none rounded-lg border border-slate-200 px-3 pr-8 text-xs focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                  >
                                    {(Object.keys(FIELD_TYPE_LABELS) as TriggerConditionFieldType[]).map(
                                      (type) => {
                                        return (
                                          <option key={type} value={type}>
                                            {FIELD_TYPE_LABELS[type]}
                                          </option>
                                        );
                                      },
                                    )}
                                  </Select>
                                  <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                </div>
                              </label>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <label className="block space-y-1">
                                <span className="text-[11px] font-semibold text-slate-500">Label (optional)</span>
                                <input
                                  value={field.label}
                                  onChange={(e) =>
                                    updateSchemaField(field.id, { label: e.target.value })
                                  }
                                  placeholder="Order Total"
                                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                              </label>
                              <div className="flex items-end">
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) =>
                                      updateSchemaField(field.id, { required: e.target.checked })
                                    }
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                                  />
                                  Required field
                                </label>
                              </div>
                            </div>

                            {field.type === "enum" && (
                              <label className="block space-y-1">
                                <span className="text-[11px] font-semibold text-slate-500">Enum Values</span>
                                <input
                                  value={field.enumValues}
                                  onChange={(e) =>
                                    updateSchemaField(field.id, { enumValues: e.target.value })
                                  }
                                  placeholder="USD, EUR, GBP"
                                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                />
                              </label>
                            )}

                            {/* Operator pills */}
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-semibold text-slate-500">Allowed Operators</span>
                              <div className="flex flex-wrap gap-1.5">
                                {(Object.keys(OPERATOR_LABELS) as TriggerConditionOperator[]).map(
                                  (operator) => {
                                    const checked = field.operators.includes(operator);
                                    return (
                                      <button
                                        key={`${field.id}-${operator}`}
                                        type="button"
                                        title={OPERATOR_LONG_LABELS[operator]}
                                        onClick={() => toggleOperator(field.id, operator)}
                                        className={clsx(
                                          "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                                          checked
                                            ? "bg-blue-600 text-white shadow-sm"
                                            : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                                        )}
                                      >
                                        {OPERATOR_LABELS[operator]}
                                      </button>
                                    );
                                  },
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Payload example */}
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Payload Example</span>
                <p className="text-[11px] text-slate-400">
                  Optional JSON example used for documentation and test pre-fill
                </p>
                <textarea
                  value={payloadExample}
                  onChange={(e) => setPayloadExample(e.target.value)}
                  rows={6}
                  spellCheck={false}
                  className="w-full rounded-lg border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed text-emerald-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>

              {/* Error */}
              {formError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <XCircle size={16} className="mt-0.5 shrink-0 text-rose-500" />
                  <p className="text-sm text-rose-700">{formError}</p>
                </div>
              )}
            </div>

            {/* Sticky save bar */}
            <div className="sticky bottom-0 flex items-center gap-3 rounded-b-2xl border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur-sm">
              <Button onClick={() => void saveTrigger()} disabled={isSaving}>
                <Save size={15} className="me-1.5" />
                {isSaving
                  ? "Saving..."
                  : editingId
                    ? "Update Trigger"
                    : "Create Trigger"}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={resetForm}>
                  Discard changes
                </Button>
              )}
            </div>
          </div>

          {/* ---- Integration snippet ---- */}
          {docsTrigger && (
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Backend Integration
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Fire this event from your backend for{" "}
                    {appName || appId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copySnippet}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
                >
                  <ClipboardCopy size={13} />
                  {copiedSnippet ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Language tabs */}
              <div className="flex gap-0 border-b border-slate-800">
                {(["curl", "node", "python"] as SnippetLang[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setSnippetLang(lang)}
                    className={clsx(
                      "px-4 py-2 text-xs font-semibold transition-colors",
                      snippetLang === lang
                        ? "border-b-2 border-blue-400 text-blue-400"
                        : "text-slate-500 hover:text-slate-300",
                    )}
                  >
                    {lang === "curl" ? "cURL" : lang === "node" ? "Node.js" : "Python"}
                  </button>
                ))}
              </div>

              <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-emerald-300">
                {generateSnippet(snippetLang, appId, docsTrigger.eventName)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
