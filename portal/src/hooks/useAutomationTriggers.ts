import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export interface AutomationTriggerDefinition {
  id: string;
  appId: string;
  name: string;
  eventName: string;
  description?: string | null;
  conditionFields?: string[] | null;
  conditionSchema?: TriggerConditionSchemaField[] | null;
  payloadExample?: Record<string, unknown> | null;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TriggerConditionFieldType =
  | "string"
  | "number"
  | "boolean"
  | "datetime"
  | "enum";

export type TriggerConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "exists"
  | "greater_than"
  | "less_than";

export interface TriggerConditionSchemaField {
  key: string;
  label?: string;
  description?: string;
  type: TriggerConditionFieldType;
  operators: TriggerConditionOperator[];
  enumValues?: string[];
  required?: boolean;
}

interface TriggerTestPayload {
  externalUserId?: string;
  userId?: string;
  deviceId?: string;
  payload?: Record<string, unknown>;
  priority?: "LOW" | "NORMAL" | "HIGH";
}

interface TriggerTestResult {
  triggerId: string;
  eventName: string;
  matchedAutomations: number;
  spawnedExecutions: number;
}

interface CreateTriggerPayload {
  name: string;
  eventName: string;
  description?: string | null;
  conditionFields?: string[];
  conditionSchema?: TriggerConditionSchemaField[];
  payloadExample?: Record<string, unknown> | null;
  isActive?: boolean;
}

export function useAutomationTriggers(appId?: string) {
  const { token } = useAuth();
  const [triggers, setTriggers] = useState<AutomationTriggerDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTriggers = useCallback(
    async (includeInactive = true) => {
      if (!token || !appId) {
        setTriggers([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const query = new URLSearchParams({ appId });
        if (includeInactive) {
          query.set("includeInactive", "true");
        }

        const data = await apiFetch<AutomationTriggerDefinition[]>(
          `/automation-triggers?${query.toString()}`,
          {},
          token,
        );
        setTriggers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setTriggers([]);
      } finally {
        setIsLoading(false);
      }
    },
    [appId, token],
  );

  useEffect(() => {
    fetchTriggers();
  }, [fetchTriggers]);

  const createTrigger = async (payload: CreateTriggerPayload) => {
    const data = await apiFetch<AutomationTriggerDefinition>(
      "/automation-triggers",
      {
        method: "POST",
        body: JSON.stringify({ ...payload, appId }),
      },
      token,
    );
    setTriggers((prev) => [data, ...prev]);
    return data;
  };

  const updateTrigger = async (
    id: string,
    payload: Partial<AutomationTriggerDefinition>,
  ) => {
    const data = await apiFetch<AutomationTriggerDefinition>(
      `/automation-triggers/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
      token,
    );
    setTriggers((prev) => prev.map((item) => (item.id === id ? data : item)));
    return data;
  };

  const deleteTrigger = async (id: string) => {
    await apiFetch(`/automation-triggers/${id}`, { method: "DELETE" }, token);
    setTriggers((prev) => prev.filter((item) => item.id !== id));
  };

  const testTrigger = async (id: string, payload: TriggerTestPayload) => {
    return apiFetch<TriggerTestResult>(
      `/automation-triggers/${id}/test`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token,
    );
  };

  return {
    triggers,
    isLoading,
    fetchTriggers,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    testTrigger,
  };
}
