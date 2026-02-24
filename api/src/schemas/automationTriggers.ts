import { z } from "zod";
import { registry } from "../docs/registry";
import { responseSchema } from "./common";

const conditionFieldSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .meta({ example: "payload.orderTotal" });

const conditionOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "contains",
  "exists",
  "greater_than",
  "less_than",
]);

const conditionFieldTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "datetime",
  "enum",
]);

const conditionSchemaFieldSchema = z
  .object({
    key: conditionFieldSchema.meta({ example: "payload.total" }),
    label: z.string().trim().max(120).optional(),
    description: z.string().trim().max(300).optional(),
    type: conditionFieldTypeSchema,
    operators: z.array(conditionOperatorSchema).min(1).max(10),
    enumValues: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    required: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.type === "enum" && (!value.enumValues || value.enumValues.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["enumValues"],
        message: "enumValues are required when field type is enum.",
      });
    }
  });

const eventNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .meta({ example: "order_created" });

export const createAutomationTriggerSchema = z
  .object({
    appId: z.string().min(1).meta({ example: "app-xyz" }),
    name: z.string().trim().min(1).max(120).meta({ example: "Order Created" }),
    eventName: eventNameSchema,
    description: z.string().trim().max(500).optional().nullable(),
    conditionFields: z.array(conditionFieldSchema).max(100).optional().default([]),
    conditionSchema: z.array(conditionSchemaFieldSchema).max(100).optional().default([]),
    payloadExample: z.record(z.string(), z.any()).optional().nullable(),
    isActive: z.boolean().optional().default(true),
  })
  .register(registry, { id: "CreateAutomationTriggerRequest" });

export const updateAutomationTriggerSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    eventName: eventNameSchema.optional(),
    description: z.string().trim().max(500).optional().nullable(),
    conditionFields: z.array(conditionFieldSchema).max(100).optional(),
    conditionSchema: z.array(conditionSchemaFieldSchema).max(100).optional(),
    payloadExample: z.record(z.string(), z.any()).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .register(registry, { id: "UpdateAutomationTriggerRequest" });

export const testAutomationTriggerSchema = z
  .object({
    externalUserId: z.string().trim().optional(),
    userId: z.string().trim().optional(),
    deviceId: z.string().trim().optional(),
    payload: z.record(z.string(), z.any()).optional().default({}),
    priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  })
  .register(registry, { id: "TestAutomationTriggerRequest" });

export const automationTriggerSchema = z
  .object({
    id: z.string().meta({ example: "atrg-123" }),
    appId: z.string().meta({ example: "app-xyz" }),
    name: z.string().meta({ example: "Order Created" }),
    eventName: z.string().meta({ example: "order_created" }),
    description: z.string().nullable(),
    conditionFields: z.array(z.string()).nullable(),
    conditionSchema: z
      .array(
        z.object({
          key: z.string(),
          label: z.string().optional(),
          description: z.string().optional(),
          type: conditionFieldTypeSchema,
          operators: z.array(conditionOperatorSchema),
          enumValues: z.array(z.string()).optional(),
          required: z.boolean().optional(),
        }),
      )
      .nullable(),
    payloadExample: z.record(z.string(), z.any()).nullable(),
    isActive: z.boolean(),
    createdBy: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .register(registry, { id: "AutomationTrigger" });

export const automationTriggerResponseSchema = responseSchema(
  automationTriggerSchema,
).register(registry, { id: "AutomationTriggerResponse" });

export const automationTriggerListResponseSchema = responseSchema(
  z.array(automationTriggerSchema),
).register(registry, { id: "AutomationTriggerListResponse" });

export const automationTriggerTestResponseSchema = responseSchema(
  z.object({
    triggerId: z.string().meta({ example: "atrg-123" }),
    eventName: z.string().meta({ example: "order_created" }),
    matchedAutomations: z.number().int().nonnegative().meta({ example: 1 }),
    spawnedExecutions: z.number().int().nonnegative().meta({ example: 1 }),
  }),
).register(registry, { id: "AutomationTriggerTestResponse" });
