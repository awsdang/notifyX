import { prisma } from "./database";
import { addNotificationToQueue } from "./queue";
import type { NotificationPayload } from "../interfaces/workers/notification";

interface NormalizedAutomationStep {
  id: string;
  type: string;
  label?: string;
  config: Record<string, unknown>;
}

type ConditionBranchMode = "continue" | "stop" | "jump";

interface ConditionBranchResolution {
  mode: ConditionBranchMode;
  rawTarget: string;
  nextStep: number;
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
  notificationPayload?: NotificationPayload;
  error?: string;
}

export interface AutomationSimulationResult {
  status: "COMPLETED" | "FAILED" | "MAX_STEPS";
  finalStepIndex: number;
  trace: AutomationSimulationTraceItem[];
  error?: string;
}

const MAX_EXECUTION_TRANSITIONS = 200;
const MAX_SIMULATION_TRANSITIONS = 200;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStepConfig = (value: unknown): Record<string, unknown> =>
  isObjectRecord(value) ? value : {};

const toStepList = (steps: unknown): NormalizedAutomationStep[] => {
  if (!Array.isArray(steps)) return [];

  const normalized: NormalizedAutomationStep[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const item = steps[index];
    if (!isObjectRecord(item) || typeof item.type !== "string") {
      continue;
    }

    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : `step-${index + 1}`;

    normalized.push({
      id,
      type: item.type,
      label: typeof item.label === "string" ? item.label : undefined,
      config: toStepConfig(item.config),
    });
  }
  return normalized;
};

const toStepIndexById = (steps: NormalizedAutomationStep[]) => {
  const map = new Map<string, number>();
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!step) continue;
    map.set(step.id, index);
  }
  return map;
};

const toNonNegativeInt = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
};

const toStringValue = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const toStringRecord = (value: unknown): Record<string, string> => {
  if (!isObjectRecord(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim()) {
      output[key] = item.trim();
    }
  }
  return output;
};

const toActionList = (
  value: unknown,
): Array<{ action: string; title: string; url?: string }> => {
  if (!Array.isArray(value)) return [];

  const actions: Array<{ action: string; title: string; url?: string }> = [];
  for (const item of value) {
    if (!isObjectRecord(item)) continue;

    const action = toStringValue(item.action);
    const title = toStringValue(item.title);
    const url = toStringValue(item.url);

    if (!action || !title) continue;

    actions.push({
      action,
      title,
      ...(url ? { url } : {}),
    });
  }

  return actions;
};

const appendCtaCandidate = (
  candidates: Array<{ action: string; title: string; url?: string }>,
  config: Record<string, unknown>,
  suffix: "" | "Secondary",
) => {
  const type = toStringValue(config[`ctaType${suffix}`]);
  const title = toStringValue(config[`ctaLabel${suffix}`]);
  const url = toStringValue(config[`ctaValue${suffix}`]);
  if (!type || type === "none" || !title) {
    return;
  }

  candidates.push({
    action: type,
    title,
    ...(url ? { url } : {}),
  });
};

const getConfigActions = (
  config: Record<string, unknown>,
): Array<{ action: string; title: string; url?: string }> => {
  const explicit = toActionList(config.actions);
  if (explicit.length > 0) {
    return explicit;
  }

  const fallback: Array<{ action: string; title: string; url?: string }> = [];
  appendCtaCandidate(fallback, config, "");
  appendCtaCandidate(fallback, config, "Secondary");
  return fallback;
};

const toNotificationPriority = (value: unknown): "LOW" | "NORMAL" | "HIGH" => {
  if (value === "LOW" || value === "NORMAL" || value === "HIGH") {
    return value;
  }
  return "HIGH";
};

const toPlatforms = (
  value: unknown,
): Array<"android" | "ios" | "huawei" | "web"> => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (platform): platform is "android" | "ios" | "huawei" | "web" =>
      platform === "android" ||
      platform === "ios" ||
      platform === "huawei" ||
      platform === "web",
  );
};

const getContextRecord = (value: unknown): Record<string, unknown> =>
  isObjectRecord(value) ? value : {};

const toNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const resolvePathValue = (
  source: Record<string, unknown>,
  path: string,
): unknown => {
  if (!path) {
    return undefined;
  }

  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  let current: unknown = source;
  for (const segment of segments) {
    if (!isObjectRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
};

const evaluateConditionStep = (
  step: NormalizedAutomationStep,
  context: Record<string, unknown>,
): boolean => {
  const expectedTrigger =
    toStringValue(step.config.triggerEvent) || toStringValue(step.config.trigger);
  const currentTrigger =
    toStringValue(context.__triggerEvent) || toStringValue(context.eventName);

  if (expectedTrigger && currentTrigger && expectedTrigger !== currentTrigger) {
    return false;
  }

  const operator = toStringValue(step.config.operator) || "equals";
  const field = toStringValue(step.config.field);
  const compareValue = step.config.value;

  const payloadRecord = getContextRecord(context.payload);
  const actualValue = field
    ? resolvePathValue(
        Object.keys(payloadRecord).length > 0 ? payloadRecord : context,
        field,
      )
    : undefined;

  switch (operator) {
    case "exists":
      return actualValue !== undefined && actualValue !== null && actualValue !== "";
    case "not_equals":
      return String(actualValue ?? "") !== String(compareValue ?? "");
    case "contains":
      if (Array.isArray(actualValue)) {
        return actualValue.some((entry) => String(entry) === String(compareValue ?? ""));
      }
      return String(actualValue ?? "").includes(String(compareValue ?? ""));
    case "greater_than": {
      const actualNumber = toNumberValue(actualValue);
      const compareNumber = toNumberValue(compareValue);
      if (actualNumber === null || compareNumber === null) return false;
      return actualNumber > compareNumber;
    }
    case "less_than": {
      const actualNumber = toNumberValue(actualValue);
      const compareNumber = toNumberValue(compareValue);
      if (actualNumber === null || compareNumber === null) return false;
      return actualNumber < compareNumber;
    }
    case "equals":
    default:
      return String(actualValue ?? "") === String(compareValue ?? "");
  }
};

const resolveConditionBranch = (
  step: NormalizedAutomationStep,
  conditionMatches: boolean,
  currentStepIndex: number,
  stepIndexById: Map<string, number>,
): ConditionBranchResolution => {
  const key = conditionMatches ? "onTrue" : "onFalse";
  const fallback = conditionMatches ? "continue" : "stop";
  const rawTarget = toStringValue(step.config[key]) || fallback;

  if (rawTarget === "continue") {
    return {
      mode: "continue",
      rawTarget,
      nextStep: currentStepIndex + 1,
    };
  }

  if (rawTarget === "stop") {
    return {
      mode: "stop",
      rawTarget,
      nextStep: -1,
    };
  }

  const jumpStep = stepIndexById.get(rawTarget);
  if (jumpStep === undefined) {
    throw new Error(`Condition branch target "${rawTarget}" does not exist.`);
  }

  return {
    mode: "jump",
    rawTarget,
    nextStep: jumpStep,
  };
};

const isNotificationStep = (step: NormalizedAutomationStep): boolean =>
  step.type === "notification" || step.type === "action";

const resolveExecutionTargets = async (
  executionUserId: string | null,
  context: Record<string, unknown>,
): Promise<string[]> => {
  const fromContext = toStringValue(context.externalUserId);
  if (fromContext) {
    return [fromContext];
  }

  if (Array.isArray(context.externalUserIds)) {
    const externalUserIds = context.externalUserIds
      .map((value) => toStringValue(value))
      .filter((value) => value.length > 0);
    if (externalUserIds.length > 0) {
      return externalUserIds;
    }
  }

  if (!executionUserId) {
    return [];
  }

  const user = await prisma.user.findUnique({
    where: { id: executionUserId },
    select: { externalUserId: true },
  });

  if (!user?.externalUserId) {
    return [];
  }

  return [user.externalUserId];
};

const resolveSimulationTargets = async (
  _executionUserId: string | null,
  context: Record<string, unknown>,
): Promise<string[]> => {
  const fromContext = toStringValue(context.externalUserId);
  if (fromContext) {
    return [fromContext];
  }

  if (Array.isArray(context.externalUserIds)) {
    const externalUserIds = context.externalUserIds
      .map((value) => toStringValue(value))
      .filter((value) => value.length > 0);
    if (externalUserIds.length > 0) {
      return externalUserIds;
    }
  }

  return [];
};

const buildNotificationDispatch = async (
  executionUserId: string | null,
  context: Record<string, unknown>,
  step: NormalizedAutomationStep,
  resolver: (
    executionUserId: string | null,
    context: Record<string, unknown>,
  ) => Promise<string[]>,
): Promise<{
  templateId: string | null;
  priority: "LOW" | "NORMAL" | "HIGH";
  payload: NotificationPayload;
}> => {
  const templateId = toStringValue(step.config.templateId);
  const title = toStringValue(step.config.title);
  const subtitle = toStringValue(step.config.subtitle);
  const body = toStringValue(step.config.body);
  const image = toStringValue(step.config.image);
  const icon = toStringValue(step.config.icon);
  const actionUrl = toStringValue(step.config.actionUrl);
  const platforms = toPlatforms(step.config.platforms);
  const priority = toNotificationPriority(step.config.priority);
  const actions = getConfigActions(step.config);
  const data = toStringRecord(step.config.data);

  if (!templateId && !title && !body) {
    throw new Error(
      "Notification step requires templateId or notification title/body",
    );
  }

  const externalUserIds = await resolver(executionUserId, context);
  if (externalUserIds.length === 0) {
    throw new Error(
      "Notification step requires externalUserId in trigger context",
    );
  }

  const payload: NotificationPayload = {
    userIds: externalUserIds,
  };

  if (platforms.length > 0) {
    payload.platforms = platforms;
  }

  const adhocContent: NonNullable<NotificationPayload["adhocContent"]> = {};
  if (title) adhocContent.title = title;
  if (subtitle) adhocContent.subtitle = subtitle;
  if (body) adhocContent.body = body;
  if (image) adhocContent.image = image;
  if (icon) adhocContent.icon = icon;
  const openUrlAction = actions.find(
    (action) => action.action === "open_url" && Boolean(action.url),
  );
  const resolvedActionUrl = actionUrl || openUrlAction?.url || "";
  if (resolvedActionUrl) adhocContent.actionUrl = resolvedActionUrl;
  if (actions.length > 0) adhocContent.actions = actions;
  if (Object.keys(data).length > 0) adhocContent.data = data;

  if (Object.keys(adhocContent).length > 0) {
    payload.adhocContent = adhocContent;
  }

  return {
    templateId: templateId || null,
    priority,
    payload,
  };
};

const executeNotificationStep = async (
  automationAppId: string,
  executionUserId: string | null,
  context: Record<string, unknown>,
  step: NormalizedAutomationStep,
): Promise<void> => {
  const dispatch = await buildNotificationDispatch(
    executionUserId,
    context,
    step,
    resolveExecutionTargets,
  );

  const notification = await prisma.notification.create({
    data: {
      appId: automationAppId,
      type: "transactional",
      status: "QUEUED",
      templateId: dispatch.templateId,
      payload: dispatch.payload as any,
      priority: dispatch.priority,
      sendAt: new Date(),
    },
  });

  await addNotificationToQueue(notification.id, dispatch.priority);
};

const advanceExecution = async (
  executionId: string,
  nextStep: number,
  resumeAt: Date,
) => {
  await prisma.automationExecution.update({
    where: { id: executionId },
    data: {
      currentStep: nextStep,
      resumeAt,
    },
  });
};

const completeExecution = async (executionId: string, currentStep: number) => {
  await prisma.automationExecution.update({
    where: { id: executionId },
    data: {
      status: "COMPLETED",
      currentStep,
      resumeAt: new Date(),
    },
  });
};

const resolveExecutionSteps = async (
  automation: { id: string; steps: unknown },
  context: Record<string, unknown>,
): Promise<NormalizedAutomationStep[]> => {
  const version = toNonNegativeInt(context.__automationVersion);

  if (version > 0) {
    const automationVersionModel = (prisma as any)?.automationVersion;
    if (automationVersionModel) {
      const snapshot = await automationVersionModel.findUnique({
        where: {
          automationId_version: {
            automationId: automation.id,
            version,
          },
        },
        select: {
          steps: true,
        },
      });

      if (snapshot?.steps) {
        return toStepList(snapshot.steps);
      }
    }
  }

  return toStepList(automation.steps);
};

const snapshotContext = (context: Record<string, unknown>): Record<string, unknown> => {
  try {
    return JSON.parse(JSON.stringify(context)) as Record<string, unknown>;
  } catch {
    return { ...context };
  }
};

export const simulateAutomationRun = async (
  stepsInput: unknown,
  contextInput: Record<string, unknown>,
): Promise<AutomationSimulationResult> => {
  const context = getContextRecord(contextInput);
  const steps = toStepList(stepsInput);
  const stepIndexById = toStepIndexById(steps);
  const trace: AutomationSimulationTraceItem[] = [];

  let cursor = 0;
  let transitions = 0;

  while (transitions < MAX_SIMULATION_TRANSITIONS) {
    if (cursor >= steps.length) {
      return {
        status: "COMPLETED",
        finalStepIndex: cursor,
        trace,
      };
    }

    const step = steps[cursor];
    if (!step) {
      return {
        status: "COMPLETED",
        finalStepIndex: cursor,
        trace,
      };
    }

    if (step.type === "delay") {
      const waitDays = toNonNegativeInt(step.config.waitDays);
      const waitHours = toNonNegativeInt(step.config.waitHours);
      const waitMinutes = toNonNegativeInt(step.config.waitMinutes);
      const totalMinutes = waitDays * 24 * 60 + waitHours * 60 + waitMinutes;
      const nextStep = cursor + 1;

      trace.push({
        stepIndex: cursor,
        stepId: step.id,
        stepType: step.type,
        label: step.label,
        summary:
          totalMinutes <= 0
            ? "Delay skipped (0 minutes)."
            : `Delay scheduled for ${totalMinutes} minute(s).`,
        nextStepIndex: nextStep,
        context: snapshotContext(context),
      });

      cursor = nextStep;
      transitions += 1;
      continue;
    }

    if (step.type === "condition") {
      const conditionMatches = evaluateConditionStep(step, context);
      const branch = resolveConditionBranch(
        step,
        conditionMatches,
        cursor,
        stepIndexById,
      );

      trace.push({
        stepIndex: cursor,
        stepId: step.id,
        stepType: step.type,
        label: step.label,
        summary: conditionMatches
          ? "Condition evaluated to TRUE."
          : "Condition evaluated to FALSE.",
        decision: conditionMatches,
        branch: branch.rawTarget,
        nextStepIndex: branch.mode === "stop" ? null : branch.nextStep,
        context: snapshotContext(context),
      });

      if (branch.mode === "stop") {
        return {
          status: "COMPLETED",
          finalStepIndex: cursor + 1,
          trace,
        };
      }

      cursor = branch.nextStep;
      transitions += 1;
      continue;
    }

    if (isNotificationStep(step)) {
      try {
        const dispatch = await buildNotificationDispatch(
          null,
          context,
          step,
          resolveSimulationTargets,
        );

        trace.push({
          stepIndex: cursor,
          stepId: step.id,
          stepType: step.type,
          label: step.label,
          summary: "Notification payload resolved.",
          nextStepIndex: cursor + 1,
          context: snapshotContext(context),
          notificationPayload: dispatch.payload,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";

        trace.push({
          stepIndex: cursor,
          stepId: step.id,
          stepType: step.type,
          label: step.label,
          summary: "Notification payload failed to resolve.",
          nextStepIndex: null,
          context: snapshotContext(context),
          error: message,
        });

        return {
          status: "FAILED",
          finalStepIndex: cursor,
          trace,
          error: message,
        };
      }
    } else {
      trace.push({
        stepIndex: cursor,
        stepId: step.id,
        stepType: step.type,
        label: step.label,
        summary: "Step skipped in simulator (no side effects).",
        nextStepIndex: cursor + 1,
        context: snapshotContext(context),
      });
    }

    cursor += 1;
    transitions += 1;
  }

  return {
    status: "MAX_STEPS",
    finalStepIndex: cursor,
    trace,
    error: "Simulation reached the maximum step transition limit.",
  };
};

export const triggerAutomation = async (
  appId: string,
  triggerType: string,
  context: Record<string, unknown>,
): Promise<{ matchedAutomations: number; spawnedExecutions: number }> => {
  try {
    const automationModel = (prisma as any)?.automation;
    if (!automationModel) {
      return {
        matchedAutomations: 0,
        spawnedExecutions: 0,
      };
    }

    const automations: Array<{ id: string; publishedVersion: number | null }> =
      await automationModel.findMany({
        where: {
          appId,
          isActive: true,
          OR: [
            {
              publishedVersion: {
                not: null,
              },
              publishedTrigger: triggerType,
            },
            {
              publishedVersion: null,
              trigger: triggerType,
            },
          ],
        },
        select: {
          id: true,
          publishedVersion: true,
        },
      });

    let spawnedExecutions = 0;
    for (const automation of automations) {
      await spawnExecution(automation.id, {
        ...context,
        eventName: toStringValue(context.eventName) || triggerType,
        __triggerEvent: triggerType,
        ...(typeof automation.publishedVersion === "number"
          ? { __automationVersion: automation.publishedVersion }
          : {}),
      });
      spawnedExecutions += 1;
    }

    return {
      matchedAutomations: automations.length,
      spawnedExecutions,
    };
  } catch (error) {
    console.error(`[Automation] Failed to trigger ${triggerType}:`, error);
    return {
      matchedAutomations: 0,
      spawnedExecutions: 0,
    };
  }
};

const spawnExecution = async (
  automationId: string,
  context: Record<string, unknown>,
) => {
  const userId = toStringValue(context.userId) || null;
  const deviceId = toStringValue(context.deviceId) || null;

  const execution = await prisma.automationExecution.create({
    data: {
      automationId,
      userId,
      deviceId,
      context: context as any,
      status: "IN_PROGRESS",
      currentStep: 0,
      resumeAt: new Date(),
    },
  });

  await processExecution(execution.id);
};

export const processExecution = async (executionId: string) => {
  const execution = await prisma.automationExecution.findUnique({
    where: { id: executionId },
    include: { automation: true },
  });

  if (!execution) return;
  if (execution.status !== "IN_PROGRESS") return;

  const context = getContextRecord(execution.context);
  const steps = await resolveExecutionSteps(execution.automation, context);
  const stepIndexById = toStepIndexById(steps);

  let cursor = execution.currentStep;
  let transitions = 0;

  try {
    while (transitions < MAX_EXECUTION_TRANSITIONS) {
      if (cursor >= steps.length) {
        await completeExecution(execution.id, cursor);
        return;
      }

      const step = steps[cursor];
      if (!step) {
        await completeExecution(execution.id, cursor);
        return;
      }

      if (step.type === "delay") {
        const waitDays = toNonNegativeInt(step.config.waitDays);
        const waitHours = toNonNegativeInt(step.config.waitHours);
        const waitMinutes = toNonNegativeInt(step.config.waitMinutes);
        const totalMinutes = waitDays * 24 * 60 + waitHours * 60 + waitMinutes;

        if (totalMinutes <= 0) {
          cursor += 1;
          await advanceExecution(execution.id, cursor, new Date());
          transitions += 1;
          continue;
        }

        const resumeTime = new Date(Date.now() + totalMinutes * 60 * 1000);
        await advanceExecution(execution.id, cursor + 1, resumeTime);
        return;
      }

      if (step.type === "condition") {
        const conditionMatches = evaluateConditionStep(step, context);
        const branch = resolveConditionBranch(
          step,
          conditionMatches,
          cursor,
          stepIndexById,
        );

        if (branch.mode === "stop") {
          await completeExecution(execution.id, cursor + 1);
          return;
        }

        cursor = branch.nextStep;
        await advanceExecution(execution.id, cursor, new Date());
        transitions += 1;
        continue;
      }

      if (isNotificationStep(step)) {
        await executeNotificationStep(
          execution.automation.appId,
          execution.userId,
          context,
          step,
        );
      }

      cursor += 1;
      await advanceExecution(execution.id, cursor, new Date());
      transitions += 1;
    }

    throw new Error("Workflow exceeded maximum step transition limit.");
  } catch (error) {
    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};
