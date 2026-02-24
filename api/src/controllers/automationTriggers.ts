import type { NextFunction, Request, Response } from "express";
import { prisma } from "../services/database";
import {
  createAutomationTriggerSchema,
  updateAutomationTriggerSchema,
  testAutomationTriggerSchema,
} from "../schemas/automationTriggers";
import { AppError, sendSuccess } from "../utils/response";
import { canAccessAppId } from "../middleware/tenantScope";
import { triggerAutomation } from "../services/automation-engine";

const getAutomationTriggerModel = () => {
  const model = (prisma as any)?.automationTrigger;
  if (!model) {
    throw new AppError(
      500,
      "Automation trigger model is unavailable. Run `bun run db:generate`, apply migrations, and restart the API.",
      "PRISMA_CLIENT_OUTDATED",
    );
  }
  return model;
};

const toConditionFields = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const field of value) {
    if (typeof field !== "string") continue;
    const trimmed = field.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

type ConditionFieldType = "string" | "number" | "boolean" | "datetime" | "enum";
type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "exists"
  | "greater_than"
  | "less_than";

interface TriggerConditionSchemaField {
  key: string;
  label?: string;
  description?: string;
  type: ConditionFieldType;
  operators: ConditionOperator[];
  enumValues?: string[];
  required?: boolean;
}

const ALLOWED_OPERATORS = new Set<ConditionOperator>([
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

const normalizeOperators = (
  type: ConditionFieldType,
  value: unknown,
): ConditionOperator[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_OPERATORS_BY_TYPE[type];
  }

  const normalized: ConditionOperator[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim() as ConditionOperator;
    if (!ALLOWED_OPERATORS.has(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  if (normalized.length === 0) {
    return DEFAULT_OPERATORS_BY_TYPE[type];
  }

  return normalized;
};

const normalizeConditionSchema = (
  schemaValue: unknown,
  fieldFallback?: unknown,
): TriggerConditionSchemaField[] => {
  const normalized: TriggerConditionSchemaField[] = [];
  const seen = new Set<string>();

  if (Array.isArray(schemaValue)) {
    for (const item of schemaValue) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const key = typeof record.key === "string" ? record.key.trim() : "";
      if (!key || seen.has(key)) continue;

      const typeCandidate =
        typeof record.type === "string" ? (record.type.trim() as ConditionFieldType) : "string";
      const type: ConditionFieldType =
        typeCandidate === "string" ||
        typeCandidate === "number" ||
        typeCandidate === "boolean" ||
        typeCandidate === "datetime" ||
        typeCandidate === "enum"
          ? typeCandidate
          : "string";

      const enumValues =
        type === "enum" && Array.isArray(record.enumValues)
          ? Array.from(
              new Set(
                record.enumValues
                  .filter((value): value is string => typeof value === "string")
                  .map((value) => value.trim())
                  .filter(Boolean),
              ),
            )
          : undefined;

      normalized.push({
        key,
        label:
          typeof record.label === "string" && record.label.trim()
            ? record.label.trim()
            : undefined,
        description:
          typeof record.description === "string" && record.description.trim()
            ? record.description.trim()
            : undefined,
        type,
        operators: normalizeOperators(type, record.operators),
        ...(enumValues && enumValues.length > 0 ? { enumValues } : {}),
        required: record.required === true,
      });
      seen.add(key);
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackFields = toConditionFields(fieldFallback);
  return fallbackFields.map((key) => ({
    key,
    type: "string",
    operators: DEFAULT_OPERATORS_BY_TYPE.string,
    required: false,
  }));
};

const toConditionFieldKeys = (
  schema: TriggerConditionSchemaField[],
): string[] => schema.map((field) => field.key);

const normalizeTriggerResponse = (trigger: Record<string, unknown>) => {
  const conditionSchema = normalizeConditionSchema(
    trigger.conditionSchema,
    trigger.conditionFields,
  );
  return {
    ...trigger,
    conditionSchema,
    conditionFields: toConditionFieldKeys(conditionSchema),
  };
};

const toPayloadRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

export const createAutomationTrigger = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = createAutomationTriggerSchema.parse(req.body);

    if (!canAccessAppId(req, data.appId)) {
      throw new AppError(403, "Insufficient permissions", "FORBIDDEN");
    }

    const app = await prisma.app.findUnique({
      where: { id: data.appId },
      select: { id: true },
    });
    if (!app) {
      throw new AppError(404, "App not found", "APP_NOT_FOUND");
    }

    const automationTriggerModel = getAutomationTriggerModel();
    const conditionSchema = normalizeConditionSchema(
      data.conditionSchema,
      data.conditionFields,
    );
    const conditionFields = toConditionFieldKeys(conditionSchema);
    const trigger = await automationTriggerModel.create({
      data: {
        appId: data.appId,
        name: data.name.trim(),
        eventName: data.eventName.trim(),
        description: data.description?.trim() || null,
        conditionFields: conditionFields as any,
        conditionSchema: conditionSchema as any,
        payloadExample: (data.payloadExample || null) as any,
        isActive: data.isActive,
        createdBy: req.adminUser?.id,
      },
    });

    sendSuccess(res, normalizeTriggerResponse(trigger), 201);
  } catch (error) {
    next(error);
  }
};

export const getAutomationTriggers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const appId = typeof req.query.appId === "string" ? req.query.appId : null;
    const includeInactive = req.query.includeInactive === "true";

    const where: Record<string, unknown> = {
      ...(appId ? { appId } : {}),
      ...(!includeInactive ? { isActive: true } : {}),
    };

    if (req.accessibleAppIds !== null && req.accessibleAppIds !== undefined) {
      (where as any).appId = appId
        ? {
            equals: appId,
            in: req.accessibleAppIds,
          }
        : { in: req.accessibleAppIds };
    }

    const automationTriggerModel = getAutomationTriggerModel();
    const triggers = await automationTriggerModel.findMany({
      where: where as any,
      orderBy: [
        { isActive: "desc" },
        { createdAt: "desc" },
      ],
    });

    sendSuccess(res, triggers.map((trigger: Record<string, unknown>) => normalizeTriggerResponse(trigger)));
  } catch (error) {
    next(error);
  }
};

export const getAutomationTrigger = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = String(req.params.id);
    const automationTriggerModel = getAutomationTriggerModel();
    const trigger = await automationTriggerModel.findUnique({
      where: { id },
    });

    if (!trigger || !canAccessAppId(req, trigger.appId)) {
      throw new AppError(404, "Trigger not found");
    }

    sendSuccess(res, normalizeTriggerResponse(trigger));
  } catch (error) {
    next(error);
  }
};

export const updateAutomationTrigger = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = String(req.params.id);
    const data = updateAutomationTriggerSchema.parse(req.body);

    const automationTriggerModel = getAutomationTriggerModel();
    const existing = await automationTriggerModel.findUnique({
      where: { id },
      select: { appId: true },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Trigger not found");
    }

    const trigger = await automationTriggerModel.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.eventName !== undefined
          ? { eventName: data.eventName.trim() }
          : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.conditionSchema !== undefined || data.conditionFields !== undefined
          ? (() => {
              const conditionSchema = normalizeConditionSchema(
                data.conditionSchema,
                data.conditionFields,
              );
              return {
                conditionSchema: conditionSchema as any,
                conditionFields: toConditionFieldKeys(conditionSchema) as any,
              };
            })()
          : {}),
        ...(data.payloadExample !== undefined
          ? { payloadExample: (data.payloadExample || null) as any }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    sendSuccess(res, normalizeTriggerResponse(trigger));
  } catch (error) {
    next(error);
  }
};

export const deleteAutomationTrigger = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = String(req.params.id);

    const automationTriggerModel = getAutomationTriggerModel();
    const existing = await automationTriggerModel.findUnique({
      where: { id },
      select: { appId: true, eventName: true },
    });

    if (!existing || !canAccessAppId(req, existing.appId)) {
      throw new AppError(404, "Trigger not found");
    }

    const linkedCount = await prisma.automation.count({
      where: {
        appId: existing.appId,
        trigger: existing.eventName,
      },
    });

    if (linkedCount > 0) {
      throw new AppError(
        409,
        "Trigger is used by active workflows. Reassign or delete those workflows first.",
        "TRIGGER_IN_USE",
      );
    }

    const deleted = await automationTriggerModel.delete({
      where: { id },
    });

    sendSuccess(res, { id: deleted.id }, 200, "Trigger deleted");
  } catch (error) {
    next(error);
  }
};

export const testAutomationTrigger = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = String(req.params.id);
    const data = testAutomationTriggerSchema.parse(req.body || {});

    const automationTriggerModel = getAutomationTriggerModel();
    const trigger = await automationTriggerModel.findUnique({
      where: { id },
      select: { id: true, appId: true, eventName: true },
    });

    if (!trigger || !canAccessAppId(req, trigger.appId)) {
      throw new AppError(404, "Trigger not found");
    }

    const payload = toPayloadRecord(data.payload);
    const context: Record<string, unknown> = {
      ...payload,
      payload,
      eventName: trigger.eventName,
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
    if (data.priority) {
      context.priority = data.priority;
    }

    const result = await triggerAutomation(trigger.appId, trigger.eventName, context);

    sendSuccess(res, {
      triggerId: trigger.id,
      eventName: trigger.eventName,
      matchedAutomations: result.matchedAutomations,
      spawnedExecutions: result.spawnedExecutions,
    });
  } catch (error) {
    next(error);
  }
};
