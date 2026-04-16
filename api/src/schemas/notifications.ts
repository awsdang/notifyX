import { z } from "zod";
import { registry } from "../docs/registry";
import { responseSchema } from "./common";

export const createNotificationSchema = z
  .object({
    appId: z.string().meta({ example: "app-xyz" }),
    type: z
      .enum([
        "transactional",
        "campaign",
        "utility",
        "marketing",
        "engagement",
      ])
      .meta({ example: "transactional" }),
    templateId: z.string().optional().meta({ example: "tmpl-123" }),
    title: z.string().optional().meta({ example: "Hello" }),
    subtitle: z.string().optional().meta({ example: "Subtitle" }),
    body: z.string().optional().meta({ example: "World" }),
    image: z
      .url()
      .optional()
      .meta({ example: "https://example.com/image.png" }),
    icon: z
      .url()
      .optional()
      .meta({ example: "https://example.com/icon.png" }),
    actionUrl: z
      .string()
      .optional()
      .meta({ example: "https://example.com/action" }),
    tapActionType: z
      .enum(["open_app", "open_url", "deep_link", "dismiss", "none"])
      .optional()
      .meta({ example: "open_app" }),
    data: z
      .record(z.string(), z.string())
      .optional()
      .meta({ example: { orderId: "123" } }),
    variables: z
      .record(z.string(), z.string())
      .optional()
      .meta({ example: { orderId: "A1023" } }),
    priority: z
      .enum(["LOW", "NORMAL", "HIGH"])
      .default("NORMAL")
      .meta({ example: "NORMAL" }),
    sendAt: z.iso
      .datetime()
      .optional()
      .meta({ example: "2024-01-01T12:00:00Z" }),
    userIds: z
      .array(z.string())
      .optional()
      .meta({ example: ["user-1", "user-2"] }),
    platforms: z
      .array(z.enum(["android", "ios", "huawei", "web"]))
      .optional()
      .meta({ example: ["ios", "android"] }),
    idempotencyKey: z
      .string()
      .max(255)
      .optional()
      .meta({ example: "idem-abc123" }),
    actions: z.array(z.any()).optional(),
  })
  .register(registry, { id: "CreateNotificationRequest" });

export const sendEventSchema = z
  .object({
    appId: z.string().meta({ example: "app-xyz" }),
    externalUserId: z.string().meta({ example: "user-123" }),
    payload: z
      .record(z.string(), z.any())
      .meta({ example: { orderId: "123" } }),
    priority: z
      .enum(["LOW", "NORMAL", "HIGH"])
      .optional()
      .meta({ example: "HIGH" }),
  })
  .register(registry, { id: "SendEventRequest" });

export const testNotificationSchema = z
  .object({
    appId: z.uuid().meta({ example: "app-xyz" }),
    deviceId: z.uuid().meta({ example: "device-xyz" }),
    title: z.string().min(1).max(200).meta({ example: "Hello" }),
    subtitle: z.string().max(200).optional().meta({ example: "Subtitle" }),
    body: z.string().min(1).max(1000).meta({ example: "World" }),
    image: z
      .url()
      .optional()
      .meta({ example: "https://example.com/image.png" }),
    icon: z.url().optional().meta({ example: "https://example.com/icon.png" }),
    actionUrl: z
      .string()
      .optional()
      .meta({ example: "https://example.com/action" }),
    tapActionType: z
      .enum(["open_app", "open_url", "deep_link", "dismiss", "none"])
      .optional()
      .meta({ example: "open_app" }),
    data: z
      .record(z.string(), z.string())
      .optional()
      .meta({ example: { orderId: "123" } }),
    actions: z.array(z.any()).optional(),
  })
  .register(registry, { id: "TestNotificationRequest" });

// Model Schemas
export const notificationSchema = z.object({
  id: z.uuid().meta({ example: "notification-xyz" }),
  appId: z.uuid().meta({ example: "app-xyz" }),
  type: z.string().meta({ example: "transactional" }),
  status: z.string().meta({ example: "DRAFT" }),
  templateId: z.uuid().nullable().meta({ example: "tmpl-123" }),
  variantId: z.uuid().nullable().meta({ example: "variant-123" }),
  campaignId: z.uuid().nullable().meta({ example: "campaign-xyz" }),
  payload: z
    .record(z.string(), z.string())
    .nullable()
    .meta({ example: { orderId: "123" } }),
  sendAt: z.iso.datetime().meta({ example: "2024-01-01T12:00:00Z" }),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).meta({ example: "NORMAL" }),
  createdBy: z.string().nullable().meta({ example: "user-xyz" }),
  createdAt: z.iso.datetime().meta({ example: "2024-01-01T12:00:00Z" }),
  updatedAt: z.iso.datetime().meta({ example: "2024-01-01T12:00:00Z" }),
});

// Response Schemas
export const notificationResponseSchema = responseSchema(
  notificationSchema,
).register(registry, { id: "NotificationResponse" });
export const sendEventResponseSchema = responseSchema(
  z.object({
    status: z.string().meta({ example: "success" }),
    notificationId: z.uuid().meta({ example: "notification-xyz" }),
  }),
).register(registry, { id: "SendEventResponse" });

export const testNotificationResponseSchema = responseSchema(
  z.object({
    message: z.string().meta({ example: "Notification sent successfully" }),
    provider: z.string().meta({ example: "fcm" }),
  }),
).register(registry, { id: "TestNotificationResponse" });
