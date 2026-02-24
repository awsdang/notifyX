import type { Request, Response, NextFunction } from "express";
import { prisma } from "../services/database";
import {
  createAutomationSchema,
  simulateAutomationSchema,
  updateAutomationSchema,
} from "../schemas/automations";
import { sendSuccess, AppError } from "../utils/response";
import { canAccessAppId } from "../middleware/tenantScope";
import { simulateAutomationRun } from "../services/automation-engine";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const toStepList = (
  value: unknown,
): Array<{ id: string; type: string; config: Record<string, unknown> }> => {
  if (!Array.isArray(value)) return [];

  const steps: Array<{ id: string; type: string; config: Record<string, unknown> }> = [];
  for (let index = 0; index < value.length; index += 1) {
    const step = value[index];
    if (!isRecord(step) || typeof step.type !== "string") {
      continue;
    }

    const config = isRecord(step.config) ? step.config : {};
    const stepId =
      typeof step.id === "string" && step.id.trim()
        ? step.id.trim()
        : `step-${index + 1}`;

    steps.push({ id: stepId, type: step.type, config });
  }
  return steps;
};

type ConditionFieldType = "string" | "number" | "boolean" | "datetime" | "enum";
type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "exists"
  | "greater_than"
  | "less_than";

interface ConditionSchemaField {
  key: string;
  type: ConditionFieldType;
  operators: ConditionOperator[];
  enumValues?: string[];
}

interface TriggerDefinition {
  eventName: string;
  conditionFields: string[];
  conditionSchema: ConditionSchemaField[];
}

const VALID_CONDITION_OPERATORS = new Set<ConditionOperator>([
  "equals",
  "not_equals",
  "contains",
  "exists",
  "greater_than",
  "less_than",
]);

const DEFAULT_OPERATORS_BY_TYPE: Record<ConditionFieldType, ConditionOperator[]> = {
  string: ["equals", "not_equals", "contains", "exists"],
  number: ["equals", "not_equals", "greater_than", "less_than", "exists"],
  boolean: ["equals", "not_equals", "exists"],
  datetime: ["equals", "not_equals", "greater_than", "less_than", "exists"],
  enum: ["equals", "not_equals", "contains", "exists"],
};

const toConditionFields = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const fields: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    fields.push(normalized);
  }
  return fields;
};

const normalizeConditionSchema = (
  schemaValue: unknown,
  fallbackFields: unknown,
): ConditionSchemaField[] => {
  const normalized: ConditionSchemaField[] = [];
  const seen = new Set<string>();

  if (Array.isArray(schemaValue)) {
    for (const item of schemaValue) {
      if (!isRecord(item)) continue;
      const key = toStringValue(item.key);
      if (!key || seen.has(key)) continue;

      const typeCandidate = toStringValue(item.type) as ConditionFieldType;
      const type: ConditionFieldType =
        typeCandidate === "string" ||
        typeCandidate === "number" ||
        typeCandidate === "boolean" ||
        typeCandidate === "datetime" ||
        typeCandidate === "enum"
          ? typeCandidate
          : "string";

      const operators = Array.isArray(item.operators)
        ? Array.from(
            new Set(
              item.operators
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.trim())
                .filter((value): value is ConditionOperator =>
                  VALID_CONDITION_OPERATORS.has(value as ConditionOperator),
                ),
            ),
          )
        : [];

      const enumValues =
        type === "enum" && Array.isArray(item.enumValues)
          ? Array.from(
              new Set(
                item.enumValues
                  .filter((value): value is string => typeof value === "string")
                  .map((value) => value.trim())
                  .filter(Boolean),
              ),
            )
          : undefined;

      normalized.push({
        key,
        type,
        operators:
          operators.length > 0
            ? operators
            : DEFAULT_OPERATORS_BY_TYPE[type],
        ...(enumValues && enumValues.length > 0 ? { enumValues } : {}),
      });
      seen.add(key);
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }

  return toConditionFields(fallbackFields).map((key) => ({
    key,
    type: "string",
    operators: DEFAULT_OPERATORS_BY_TYPE.string,
  }));
};

const parseBooleanValue = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
};

const validateConditionValueType = (
  field: ConditionSchemaField,
  operator: ConditionOperator,
  value: unknown,
) => {
  if (operator === "exists") {
    return;
  }

  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    throw new AppError(
      400,
      `Condition value is required for field "${field.key}" with operator "${operator}".`,
      "INVALID_CONDITION_VALUE",
    );
  }

  if (field.type === "number") {
    const numberValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new AppError(
        400,
        `Condition value for "${field.key}" must be numeric.`,
        "INVALID_CONDITION_VALUE",
      );
    }
  }

  if (field.type === "boolean") {
    if (parseBooleanValue(value) === null) {
      throw new AppError(
        400,
        `Condition value for "${field.key}" must be boolean (true/false).`,
        "INVALID_CONDITION_VALUE",
      );
    }
  }

  if (field.type === "datetime") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new AppError(
        400,
        `Condition value for "${field.key}" must be a valid datetime.`,
        "INVALID_CONDITION_VALUE",
      );
    }
  }

  if (field.type === "enum" && field.enumValues?.length) {
    const normalized = String(value).trim();
    if (!field.enumValues.includes(normalized)) {
      throw new AppError(
        400,
        `Condition value for "${field.key}" must be one of: ${field.enumValues.join(", ")}.`,
        "INVALID_CONDITION_VALUE",
      );
    }
  }
};

const validateBranchTarget = (
  branchValue: unknown,
  branchName: "onTrue" | "onFalse",
  stepIds: Set<string>,
) => {
  const target = toStringValue(branchValue);
  if (!target) {
    return;
  }

  if (target === "continue" || target === "stop") {
    return;
  }

  if (!stepIds.has(target)) {
    throw new AppError(
      400,
      `Condition ${branchName} branch references unknown step id "${target}".`,
      "INVALID_BRANCH_TARGET",
    );
  }
};

const getAutomationVersionModel = () => {
  const model = (prisma as any)?.automationVersion;
  if (!model) {
    throw new AppError(
      500,
      "Automation version model is unavailable. Run `bun run db:generate`, apply migrations, and restart the API.",
      "PRISMA_CLIENT_OUTDATED",
    );
  }
  return model;
};

const serializeAutomation = (automation: Record<string, unknown>) => {
  const draftVersion =
    typeof automation.draftVersion === "number" && Number.isFinite(automation.draftVersion)
      ? automation.draftVersion
      : 1;
  const publishedVersion =
    typeof automation.publishedVersion === "number" && Number.isFinite(automation.publishedVersion)
      ? automation.publishedVersion
      : null;

  return {
    ...automation,
    draftVersion,
    publishedVersion,
    hasUnpublishedChanges:
      publishedVersion === null || draftVersion > publishedVersion,
  };
};

const validateAutomationWorkflow = async (
  appId: string,
  triggerEventName: string,
  steps: unknown,
) => {
  const normalizedTrigger = triggerEventName.trim();
  if (!normalizedTrigger) {
    throw new AppError(400, "Automation trigger is required", "INVALID_TRIGGER");
  }

  const automationTriggerModel = (prisma as any)?.automationTrigger;
  if (!automationTriggerModel) {
    throw new AppError(
      500,
      "Automation trigger model is unavailable. Run `bun run db:generate`, apply migrations, and restart the API.",
      "PRISMA_CLIENT_OUTDATED",
    );
  }

  const triggerDefinitionsRaw = await automationTriggerModel.findMany({
    where: {
      appId,
      isActive: true,
    },
    select: {
      eventName: true,
      conditionFields: true,
      conditionSchema: true,
    },
  });

  if (!Array.isArray(triggerDefinitionsRaw) || triggerDefinitionsRaw.length === 0) {
    throw new AppError(
      400,
      "No active triggers found for this app. Create a trigger first.",
      "TRIGGER_NOT_FOUND",
    );
  }

  const triggerDefinitions: TriggerDefinition[] = triggerDefinitionsRaw.map((definition: any) => ({
    eventName: String(definition.eventName),
    conditionFields: toConditionFields(definition.conditionFields),
    conditionSchema: normalizeConditionSchema(
      definition.conditionSchema,
      definition.conditionFields,
    ),
  }));

  const triggerMap = new Map<string, TriggerDefinition>(
    triggerDefinitions.map((definition) => [definition.eventName, definition]),
  );

  if (!triggerMap.has(normalizedTrigger)) {
    throw new AppError(
      400,
      "Automation trigger must be selected from this app's trigger catalog.",
      "TRIGGER_NOT_FOUND",
    );
  }

  const normalizedSteps = toStepList(steps);
  const referencedTemplateIds = new Set<string>();
  const stepIds = new Set(normalizedSteps.map((step) => step.id));

  for (const step of normalizedSteps) {
    if (step.type === "condition") {
      const conditionTriggerEvent =
        toStringValue(step.config.triggerEvent) || normalizedTrigger;
      const triggerDefinition = triggerMap.get(conditionTriggerEvent);
      if (!triggerDefinition) {
        throw new AppError(
          400,
          `Condition step references unknown trigger "${conditionTriggerEvent}".`,
          "TRIGGER_NOT_FOUND",
        );
      }

      const conditionField = toStringValue(step.config.field);
      if (!conditionField) {
        throw new AppError(
          400,
          "Condition field is required.",
          "INVALID_CONDITION_FIELD",
        );
      }

      const conditionFieldDefinition =
        triggerDefinition.conditionSchema.find((field) => field.key === conditionField) ||
        null;

      if (
        triggerDefinition.conditionSchema.length > 0 &&
        !conditionFieldDefinition
      ) {
        throw new AppError(
          400,
          `Condition field "${conditionField}" is not allowed for trigger "${conditionTriggerEvent}".`,
          "INVALID_CONDITION_FIELD",
        );
      }

      if (
        !conditionFieldDefinition &&
        triggerDefinition.conditionSchema.length === 0 &&
        triggerDefinition.conditionFields.length > 0 &&
        !triggerDefinition.conditionFields.includes(conditionField)
      ) {
        throw new AppError(
          400,
          `Condition field "${conditionField}" is not allowed for trigger "${conditionTriggerEvent}".`,
          "INVALID_CONDITION_FIELD",
        );
      }

      const operator =
        (toStringValue(step.config.operator) as ConditionOperator) || "equals";

      if (!VALID_CONDITION_OPERATORS.has(operator)) {
        throw new AppError(
          400,
          `Unsupported condition operator "${operator}".`,
          "INVALID_CONDITION_OPERATOR",
        );
      }

      if (conditionFieldDefinition) {
        const allowedOperators = new Set(conditionFieldDefinition.operators);
        if (!allowedOperators.has(operator)) {
          throw new AppError(
            400,
            `Operator "${operator}" is not allowed for field "${conditionField}".`,
            "INVALID_CONDITION_OPERATOR",
          );
        }

        validateConditionValueType(
          conditionFieldDefinition,
          operator,
          step.config.value,
        );
      }

      validateBranchTarget(step.config.onTrue, "onTrue", stepIds);
      validateBranchTarget(step.config.onFalse, "onFalse", stepIds);
    }

    if (step.type === "notification" || step.type === "action") {
      const templateId = toStringValue(step.config.templateId);
      if (templateId) {
        referencedTemplateIds.add(templateId);
      }
    }
  }

  if (referencedTemplateIds.size > 0) {
    const templates = await prisma.notificationTemplate.findMany({
      where: {
        appId,
        id: { in: Array.from(referencedTemplateIds) },
      },
      select: { id: true },
    });

    if (templates.length !== referencedTemplateIds.size) {
      throw new AppError(
        400,
        "One or more notification step templates are invalid for this app.",
        "TEMPLATE_NOT_FOUND",
      );
    }
  }
};

const publishAutomationDraft = async (
  automation: {
    id: string;
    draftVersion: number;
    name: string;
    description: string | null;
    trigger: string;
    triggerConfig: unknown;
    steps: unknown;
    createdBy: string | null;
  },
  publishedBy?: string | null,
) => {
  const version =
    typeof automation.draftVersion === "number" && Number.isFinite(automation.draftVersion)
      ? Math.max(1, Math.floor(automation.draftVersion))
      : 1;

  const trigger = automation.trigger.trim();
  if (!trigger) {
    throw new AppError(400, "Automation trigger is required", "INVALID_TRIGGER");
  }

  const automationVersionModel = getAutomationVersionModel();
  const publishedAt = new Date();

  await automationVersionModel.upsert({
    where: {
      automationId_version: {
        automationId: automation.id,
        version,
      },
    },
    update: {
      name: automation.name,
      description: automation.description,
      trigger,
      triggerConfig: (automation.triggerConfig || {}) as any,
      steps: (automation.steps || []) as any,
      createdBy: publishedBy || automation.createdBy,
      publishedAt,
    },
    create: {
      automationId: automation.id,
      version,
      name: automation.name,
      description: automation.description,
      trigger,
      triggerConfig: (automation.triggerConfig || {}) as any,
      steps: (automation.steps || []) as any,
      createdBy: publishedBy || automation.createdBy,
      publishedAt,
    },
  });

  return prisma.automation.update({
    where: { id: automation.id },
    data: {
      publishedVersion: version,
      publishedTrigger: trigger,
      publishedAt,
    },
  });
};

export const createAutomation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = createAutomationSchema.parse(req.body);

    if (!canAccessAppId(req, data.appId)) {
      throw new AppError(403, "Insufficient permissions", "FORBIDDEN");
    }

    await validateAutomationWorkflow(data.appId, data.trigger, data.steps);

    let automation = await prisma.automation.create({
      data: {
        appId: data.appId,
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        trigger: data.trigger.trim(),
        triggerConfig: (data.triggerConfig || {}) as any,
        steps: (data.steps || []) as any,
        createdBy: (req as any).adminUser?.id,
      },
    });

    if (automation.isActive) {
      automation = await publishAutomationDraft(
        {
          id: automation.id,
          draftVersion: automation.draftVersion,
          name: automation.name,
          description: automation.description,
          trigger: automation.trigger,
          triggerConfig: automation.triggerConfig,
          steps: automation.steps,
          createdBy: automation.createdBy,
        },
        req.adminUser?.id,
      );
    }

    sendSuccess(res, serializeAutomation(automation as unknown as Record<string, unknown>), 201);
  } catch (error) {
    next(error);
  }
};

export const getAutomations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { appId } = req.query;
    const where: any = appId ? { appId: String(appId) } : {};

    if (req.accessibleAppIds !== null && req.accessibleAppIds !== undefined) {
      where.appId = appId
        ? {
            equals: String(appId),
            in: req.accessibleAppIds,
          }
        : { in: req.accessibleAppIds };
    }

    const automations = await prisma.automation.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(
      res,
      automations.map((automation) =>
        serializeAutomation(automation as unknown as Record<string, unknown>),
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const getAutomation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const automation = await prisma.automation.findUnique({
      where: { id: String(id) },
    });
    if (!automation) {
      throw new AppError(404, "Automation not found");
    }

    if (!canAccessAppId(req, automation.appId)) {
      throw new AppError(404, "Automation not found");
    }

    sendSuccess(res, serializeAutomation(automation as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
};

export const updateAutomation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;
  try {
    const data = updateAutomationSchema.parse(req.body);
    const existing = await prisma.automation.findUnique({
      where: { id: String(id) },
      select: {
        appId: true,
        trigger: true,
        steps: true,
        draftVersion: true,
        publishedVersion: true,
      },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Automation not found");
    }

    const nextTrigger = data.trigger ?? existing.trigger;
    const nextSteps = data.steps ?? existing.steps;
    await validateAutomationWorkflow(existing.appId, nextTrigger, nextSteps);

    if (data.isActive === true && existing.publishedVersion === null) {
      throw new AppError(
        409,
        "Publish this workflow before activating it.",
        "PUBLISH_REQUIRED",
      );
    }

    const updatesDraft =
      data.name !== undefined ||
      data.description !== undefined ||
      data.trigger !== undefined ||
      data.triggerConfig !== undefined ||
      data.steps !== undefined;

    const automation = await prisma.automation.update({
      where: { id: String(id) },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.trigger !== undefined ? { trigger: data.trigger.trim() } : {}),
        ...(data.triggerConfig !== undefined
          ? { triggerConfig: (data.triggerConfig || {}) as any }
          : {}),
        ...(data.steps !== undefined ? { steps: (data.steps || []) as any } : {}),
        ...(updatesDraft ? { draftVersion: { increment: 1 } } : {}),
      },
    });
    sendSuccess(res, serializeAutomation(automation as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
};

export const deleteAutomation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;
  try {
    const existing = await prisma.automation.findUnique({
      where: { id: String(id) },
      select: { appId: true },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Automation not found");
    }

    const deleted = await prisma.automation.delete({
      where: { id: String(id) },
    });
    sendSuccess(res, { id: deleted.id }, 200, "Automation deleted");
  } catch (error) {
    next(error);
  }
};

export const toggleAutomation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;
  try {
    const existing = await prisma.automation.findUnique({
      where: { id: String(id) },
      select: { appId: true, isActive: true, publishedVersion: true },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Automation not found");
    }

    if (!existing.isActive && existing.publishedVersion === null) {
      throw new AppError(
        409,
        "Publish this workflow before activating it.",
        "PUBLISH_REQUIRED",
      );
    }

    const automation = await prisma.automation.update({
      where: { id: String(id) },
      data: { isActive: !existing.isActive },
    });
    sendSuccess(res, serializeAutomation(automation as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
};

export const publishAutomation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;
  try {
    const existing = await prisma.automation.findUnique({
      where: { id: String(id) },
      select: {
        id: true,
        appId: true,
        name: true,
        description: true,
        trigger: true,
        triggerConfig: true,
        steps: true,
        draftVersion: true,
        createdBy: true,
      },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Automation not found");
    }

    await validateAutomationWorkflow(existing.appId, existing.trigger, existing.steps);

    const published = await publishAutomationDraft(
      {
        id: existing.id,
        draftVersion: existing.draftVersion,
        name: existing.name,
        description: existing.description,
        trigger: existing.trigger,
        triggerConfig: existing.triggerConfig,
        steps: existing.steps,
        createdBy: existing.createdBy,
      },
      req.adminUser?.id,
    );

    sendSuccess(
      res,
      serializeAutomation(published as unknown as Record<string, unknown>),
      200,
      "Automation published",
    );
  } catch (error) {
    next(error);
  }
};

export const simulateAutomation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params;
  try {
    const data = simulateAutomationSchema.parse(req.body || {});

    const existing = await prisma.automation.findUnique({
      where: { id: String(id) },
      select: {
        id: true,
        appId: true,
        trigger: true,
        steps: true,
        draftVersion: true,
        publishedVersion: true,
      },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Automation not found");
    }

    let simulationTrigger = existing.trigger;
    let simulationSteps: unknown = existing.steps;
    let mode: "draft" | "published" = "draft";
    let version = existing.draftVersion;

    if (data.usePublished) {
      if (existing.publishedVersion === null) {
        throw new AppError(
          409,
          "No published version exists for this workflow.",
          "PUBLISHED_VERSION_NOT_FOUND",
        );
      }

      const automationVersionModel = getAutomationVersionModel();
      const snapshot = await automationVersionModel.findUnique({
        where: {
          automationId_version: {
            automationId: existing.id,
            version: existing.publishedVersion,
          },
        },
      });

      if (!snapshot) {
        throw new AppError(
          404,
          "Published workflow snapshot not found.",
          "PUBLISHED_VERSION_NOT_FOUND",
        );
      }

      simulationTrigger = String(snapshot.trigger);
      simulationSteps = snapshot.steps;
      mode = "published";
      version = Number(snapshot.version) || existing.publishedVersion;
    }

    const payload = isRecord(data.payload) ? data.payload : {};

    const context: Record<string, unknown> = {
      ...payload,
      payload,
      eventName: simulationTrigger,
      __triggerEvent: simulationTrigger,
    };

    if (data.externalUserId?.trim()) {
      context.externalUserId = data.externalUserId.trim();
    }
    if (data.userId?.trim()) {
      context.userId = data.userId.trim();
    }
    if (data.deviceId?.trim()) {
      context.deviceId = data.deviceId.trim();
    }

    const result = await simulateAutomationRun(simulationSteps, context);

    sendSuccess(res, {
      automationId: existing.id,
      mode,
      version,
      trigger: simulationTrigger,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
