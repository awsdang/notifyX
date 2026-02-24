import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export interface AutomationStep {
  id?: string;
  type: "trigger" | "delay" | "action" | "condition" | "notification";
  label?: string;
  description?: string;
  color?: string;
  config?: Record<string, unknown> | null;
}

export interface Automation {
  id: string;
  appId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  trigger: string;
  triggerConfig?: Record<string, unknown> | null;
  steps: AutomationStep[];
  draftVersion?: number;
  publishedVersion?: number | null;
  publishedTrigger?: string | null;
  publishedAt?: string | null;
  hasUnpublishedChanges?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationSimulationTraceItem {
  stepIndex: number;
  stepId: string;
  stepType: string;
  label?: string;
  summary: string;
  decision?: boolean;
  branch?: string;
  nextStepIndex: number | null;
  context: Record<string, unknown>;
  notificationPayload?: Record<string, unknown>;
  error?: string;
}

export interface AutomationSimulationResult {
  automationId: string;
  mode: "draft" | "published";
  version: number;
  trigger: string;
  status: "COMPLETED" | "FAILED" | "MAX_STEPS";
  finalStepIndex: number;
  trace: AutomationSimulationTraceItem[];
  error?: string;
}

interface AutomationSimulationPayload {
  externalUserId?: string;
  userId?: string;
  deviceId?: string;
  payload?: Record<string, unknown>;
  usePublished?: boolean;
}

export function useAutomations(appId?: string) {
  const { token } = useAuth();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAutomations = useCallback(async () => {
    if (!token || !appId) {
      setAutomations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiFetch<Automation[]>(
        `/automations?appId=${appId}`,
        {},
        token,
      );
      setAutomations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setAutomations([]);
    } finally {
      setIsLoading(false);
    }
  }, [token, appId]);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const createAutomation = async (payload: Partial<Automation>) => {
    const data = await apiFetch<Automation>(
      "/automations",
      {
        method: "POST",
        body: JSON.stringify({ ...payload, appId }),
      },
      token,
    );
    setAutomations((prev) => [data, ...prev]);
    return data;
  };

  const updateAutomation = async (id: string, payload: Partial<Automation>) => {
    const data = await apiFetch<Automation>(
      `/automations/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
      token,
    );
    setAutomations((prev) => prev.map((automation) => (automation.id === id ? data : automation)));
    return data;
  };

  const publishAutomation = async (id: string) => {
    const data = await apiFetch<Automation>(
      `/automations/${id}/publish`,
      {
        method: "POST",
      },
      token,
    );
    setAutomations((prev) => prev.map((automation) => (automation.id === id ? data : automation)));
    return data;
  };

  const simulateAutomation = async (
    id: string,
    payload: AutomationSimulationPayload,
  ) => {
    return apiFetch<AutomationSimulationResult>(
      `/automations/${id}/simulate`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token,
    );
  };

  const toggleAutomation = async (id: string) => {
    const data = await apiFetch<Automation>(
      `/automations/${id}/toggle`,
      {
        method: "POST",
      },
      token,
    );
    setAutomations((prev) => prev.map((automation) => (automation.id === id ? data : automation)));
    return data;
  };

  const deleteAutomation = async (id: string) => {
    await apiFetch(`/automations/${id}`, { method: "DELETE" }, token);
    setAutomations((prev) => prev.filter((automation) => automation.id !== id));
  };

  return {
    automations,
    isLoading,
    fetchAutomations,
    createAutomation,
    updateAutomation,
    publishAutomation,
    simulateAutomation,
    toggleAutomation,
    deleteAutomation,
  };
}
