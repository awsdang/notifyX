import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
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

const OPERATOR_LABELS: Record<TriggerConditionOperator, string> = {
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
}

const createFieldId = () =>
  `field-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const toPayloadExampleInput = (trigger?: AutomationTriggerDefinition | null): string => {
  if (!trigger?.payloadExample || typeof trigger.payloadExample !== "object") {
    return "{\n  \"key\": \"value\"\n}";
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
        type: "string",
        operators: DEFAULT_OPERATORS_BY_TYPE.string,
        enumValues: "",
        required: false,
      }));
    }

    return [
      {
        id: createFieldId(),
        key: "payload.key",
        label: "",
        type: "string",
        operators: DEFAULT_OPERATORS_BY_TYPE.string,
        enumValues: "",
        required: false,
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
      throw new Error(`Enum field \"${key}\" needs at least one enum value.`);
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
  const [payloadExample, setPayloadExample] = useState("{\n  \"key\": \"value\"\n}");
  const [isActive, setIsActive] = useState(true);
  const [schemaFields, setSchemaFields] = useState<EditableSchemaField[]>(() =>
    toSchemaEditorRows(null),
  );

  const [testExternalUserId, setTestExternalUserId] = useState("demo-user-123");
  const [testPayload, setTestPayload] = useState("{\n  \"key\": \"value\"\n}");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

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
    setPayloadExample("{\n  \"key\": \"value\"\n}");
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

  const runTriggerTest = async (trigger: AutomationTriggerDefinition) => {
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = (parsePayloadExample(testPayload) || {}) as Record<string, unknown>;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Invalid test payload JSON.");
      return;
    }

    setIsTesting(trigger.id);
    setTestResult(null);
    setFormError(null);

    try {
      const result = await testTrigger(trigger.id, {
        externalUserId: testExternalUserId.trim() || undefined,
        payload: parsedPayload,
      });
      setTestResult(
        `${trigger.eventName}: matched ${result.matchedAutomations}, spawned ${result.spawnedExecutions}`,
      );
      setSelectedTriggerId(trigger.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to test trigger.");
    } finally {
      setIsTesting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-bold text-slate-900">Trigger Catalog</h4>
                <p className="text-sm text-slate-500">
                  Add/edit/delete trigger definitions.
                </p>
              </div>
              <Button variant="outline" onClick={startCreate}>
                <Plus size={16} className="me-2" />
                New
              </Button>
            </div>

            <div className="space-y-3">
              {isLoading ? (
                <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
                  Loading triggers...
                </div>
              ) : triggers.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
                  No triggers yet.
                </div>
              ) : (
                triggers.map((trigger) => (
                  <button
                    key={trigger.id}
                    type="button"
                    onClick={() => setSelectedTriggerId(trigger.id)}
                    className={`w-full rounded-xl border p-4 text-start transition-colors ${
                      selectedTriggerId === trigger.id
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{trigger.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          trigger.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {trigger.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{trigger.eventName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {(trigger.conditionSchema || []).length || (trigger.conditionFields || []).length} guided field(s)
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEdit(trigger);
                        }}
                      >
                        <Pencil size={14} className="me-1" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          void runTriggerTest(trigger);
                        }}
                        disabled={isTesting === trigger.id}
                      >
                        <FlaskConical size={14} className="me-1" />
                        {isTesting === trigger.id ? "Testing..." : "Test"}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeTrigger(trigger.id);
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <h4 className="text-sm font-bold text-slate-900">Trigger Test</h4>
            <p className="mt-1 text-xs text-slate-500">
              Quickly run selected trigger against payload input.
            </p>

            <div className="mt-3 space-y-3">
              <input
                value={testExternalUserId}
                onChange={(event) => setTestExternalUserId(event.target.value)}
                placeholder="externalUserId"
                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
              />
              <textarea
                value={testPayload}
                onChange={(event) => setTestPayload(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-xs"
              />
              <Button
                disabled={!selectedTrigger || isTesting === selectedTrigger?.id}
                onClick={() => {
                  if (selectedTrigger) {
                    void runTriggerTest(selectedTrigger);
                  }
                }}
              >
                <FlaskConical size={16} className="me-2" />
                {isTesting && selectedTrigger?.id === isTesting
                  ? "Testing..."
                  : "Run Selected Trigger"}
              </Button>
            </div>

            {testResult ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {testResult}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-bold text-slate-900">
                  {editingId ? "Edit Trigger" : "Create Trigger"}
                </h4>
                <p className="text-sm text-slate-500">
                  Add/edit opens this editor and controls allowed condition paths/operators.
                </p>
              </div>
              {editingId ? (
                <Button variant="outline" onClick={resetForm}>
                  Cancel Edit
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Trigger Name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Order Paid"
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Event Name
                </span>
                <input
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  placeholder="order_paid"
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Description
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                placeholder="Explain when this trigger should fire"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
              />
            </label>

            <label className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Active in workflow builders
            </label>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Trigger Schema (typed fields/operators)
                </p>
                <Button variant="outline" size="sm" onClick={addSchemaField}>
                  <Plus size={14} className="me-1" />
                  Add Field
                </Button>
              </div>

              <div className="space-y-4">
                {schemaFields.map((field, index) => (
                  <div key={field.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Field {index + 1}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => removeSchemaField(field.id)}
                        disabled={schemaFields.length <= 1}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <label className="space-y-1 md:col-span-2">
                        <span className="text-xs font-semibold text-slate-600">Path</span>
                        <input
                          value={field.key}
                          onChange={(event) =>
                            updateSchemaField(field.id, { key: event.target.value })
                          }
                          placeholder="payload.total"
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-600">Type</span>
                        <select
                          value={field.type}
                          onChange={(event) =>
                            updateSchemaField(field.id, {
                              type: event.target.value as TriggerConditionFieldType,
                            })
                          }
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                        >
                          {(Object.keys(FIELD_TYPE_LABELS) as TriggerConditionFieldType[]).map(
                            (type) => (
                              <option key={type} value={type}>
                                {FIELD_TYPE_LABELS[type]}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-600">Label (optional)</span>
                        <input
                          value={field.label}
                          onChange={(event) =>
                            updateSchemaField(field.id, { label: event.target.value })
                          }
                          placeholder="Order Total"
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) =>
                            updateSchemaField(field.id, { required: event.target.checked })
                          }
                        />
                        Required
                      </label>
                    </div>

                    {field.type === "enum" ? (
                      <label className="mt-3 block space-y-1">
                        <span className="text-xs font-semibold text-slate-600">Enum Values</span>
                        <input
                          value={field.enumValues}
                          onChange={(event) =>
                            updateSchemaField(field.id, { enumValues: event.target.value })
                          }
                          placeholder="USD, EUR, GBP"
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                        />
                      </label>
                    ) : null}

                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-600">Allowed operators</p>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(OPERATOR_LABELS) as TriggerConditionOperator[]).map(
                          (operator) => {
                            const checked = field.operators.includes(operator);
                            return (
                              <button
                                key={`${field.id}-${operator}`}
                                type="button"
                                onClick={() => toggleOperator(field.id, operator)}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                  checked
                                    ? "border-blue-200 bg-blue-50 text-blue-700"
                                    : "border-slate-200 bg-white text-slate-600"
                                }`}
                              >
                                {OPERATOR_LABELS[operator]}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <label className="mt-6 block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Payload Example (optional)
              </span>
              <textarea
                value={payloadExample}
                onChange={(event) => setPayloadExample(event.target.value)}
                rows={6}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-xs"
              />
            </label>

            {formError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {formError}
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-2">
              <Button onClick={saveTrigger} disabled={isSaving}>
                <Save size={16} className="me-2" />
                {isSaving
                  ? "Saving..."
                  : editingId
                    ? "Update Trigger"
                    : "Create Trigger"}
              </Button>
            </div>
          </div>

          {docsTrigger ? (
            <div className="rounded-2xl border bg-slate-950 p-5 text-slate-100">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Backend Integration Snippet
              </p>
              <p className="mt-1 text-sm text-slate-200">
                Backend services should fire this event to trigger workflows for
                {` ${appName || appId}`}
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs leading-relaxed text-emerald-200">
{`curl -X POST "$NOTIFYX_URL/api/v1/events/${docsTrigger.eventName}" \\
  -H "X-API-Key: $NOTIFYX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "${appId}",
    "externalUserId": "user_123",
    "payload": {
      "key": "value"
    }
  }'`}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
