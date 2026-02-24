import { z } from "zod";

export const automationStepSchema = z.object({
    id: z.string().optional(),
    type: z.enum(["trigger", "delay", "action", "condition", "notification"]),
    label: z.string().optional(),
    description: z.string().optional(),
    color: z.string().optional(),
    config: z.record(z.string(), z.any()).optional().nullable()
});

export const createAutomationSchema = z.object({
    appId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    isActive: z.boolean().default(false),
    trigger: z.string().min(1),
    triggerConfig: z.record(z.string(), z.any()).optional().nullable(),
    steps: z.array(automationStepSchema).optional().default([]),
});

export const updateAutomationSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    trigger: z.string().min(1).optional(),
    triggerConfig: z.record(z.string(), z.any()).optional().nullable(),
    steps: z.array(automationStepSchema).optional(),
});

export const simulateAutomationSchema = z.object({
    externalUserId: z.string().trim().optional(),
    userId: z.string().trim().optional(),
    deviceId: z.string().trim().optional(),
    payload: z.record(z.string(), z.any()).optional().default({}),
    usePublished: z.boolean().optional().default(false),
});
