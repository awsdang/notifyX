import { z } from "zod";
import { registry } from "../docs/registry";
import { responseSchema } from "./common";

export const registerUserSchema = z
  .object({
    externalUserId: z.string().meta({ example: "user-123" }),
    appId: z.string().meta({ example: "app-xyz" }),
    language: z.string().optional().meta({ example: "en" }),
    timezone: z.string().optional().meta({ example: "UTC" }),
    nickname: z.string().trim().max(64).optional().meta({ example: "Jane" }),
    phone: z
      .string()
      .trim()
      .max(32)
      .optional()
      .meta({ example: "+15551234567" }),
  })
  .register(registry, { id: "RegisterUserRequest" });

export const updateUserNicknameSchema = z
  .object({
    nickname: z
      .union([z.string().trim().max(64), z.null()])
      .transform((value) => (value === "" ? null : value)),
  })
  .register(registry, { id: "UpdateUserNicknameRequest" });

export const setTestFavouritesSchema = z
  .object({
    appId: z.string().meta({ example: "app-xyz" }),
    externalUserIds: z
      .array(z.string().trim().min(1))
      .max(1000)
      .meta({ example: ["user-123", "user-456"] }),
  })
  .register(registry, { id: "SetTestFavouritesRequest" });

export const registerDeviceSchema = z
  .object({
    userId: z.string().meta({ example: "user-123" }),
    platform: z
      .enum(["android", "ios", "web", "huawei"])
      .meta({ example: "android" }),
    pushToken: z.string().meta({ example: "fcm-token-123" }),
    provider: z.enum(["fcm", "apns", "hms", "web"]).meta({ example: "fcm" }),
    deviceId: z
      .string()
      .uuid()
      .optional()
      .meta({
        example: "d1e2f3a4-b5c6-7890-abcd-ef1234567890",
        description:
          "Existing device ID to update (e.g. on token refresh). When provided, the existing device record is updated in-place instead of creating a duplicate.",
      }),
    externalDeviceId: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .meta({
        example: "ios-vendor-123",
        description:
          "Client-managed device identifier used to update the same physical device across subscription refreshes.",
      }),
    tokenExpiresAt: z.iso
      .datetime()
      .optional()
      .meta({
        example: "2026-12-01T00:00:00Z",
        description:
          "When the push subscription is known to expire. Only web push reports this (PushSubscription.expirationTime); FCM/APNs/HMS tokens have no fixed lifetime and should omit it.",
      }),
  })
  .register(registry, { id: "RegisterDeviceRequest" });

// Model Schemas
export const userSchema = z.object({
  id: z.uuid().meta({ example: "user-123" }),
  externalUserId: z.string().meta({ example: "user-123" }),
  nickname: z.string().nullable().meta({ example: "Jane" }),
  phone: z.string().nullable().meta({ example: "+15551234567" }),
  appId: z.string().uuid().meta({ example: "app-xyz" }),
  language: z.string().meta({ example: "en" }),
  timezone: z.string().meta({ example: "UTC" }),
  createdAt: z.iso.datetime().meta({ example: "2024-01-01T12:00:00Z" }),
  updatedAt: z.iso.datetime().meta({ example: "2024-01-01T12:00:00Z" }),
  deletedAt: z.iso
    .datetime()
    .nullable()
    .meta({ example: "2024-01-01T12:00:00Z" }),
});

export const deviceSchema = z.object({
  id: z.uuid().meta({ example: "device-123" }),
  externalDeviceId: z.string().nullable().meta({ example: "ios-vendor-123" }),
  userId: z.uuid().meta({ example: "user-123" }),
  platform: z
    .enum(["android", "ios", "web", "huawei"])
    .meta({ example: "android" }),
  pushToken: z.string().meta({ example: "fcm-token-123" }),
  provider: z.enum(["fcm", "apns", "hms", "web"]).meta({ example: "fcm" }),
  isActive: z.boolean().meta({ example: true }),
  lastSeenAt: z.iso.datetime().meta({ example: "2024-01-01T12:00:00Z" }),
  tokenExpiresAt: z.iso
    .datetime()
    .nullable()
    .meta({ example: "2024-01-01T12:00:00Z" }),
  tokenInvalidAt: z.iso
    .datetime()
    .nullable()
    .meta({ example: "2024-01-01T12:00:00Z" }),
  deactivatedAt: z.iso
    .datetime()
    .nullable()
    .meta({ example: "2024-01-01T12:00:00Z" }),
  deactivatedBy: z.string().nullable().meta({ example: "user-123" }),
  deactivationReason: z
    .string()
    .nullable()
    .meta({ example: "Device deactivated" }),
  deactivationNote: z
    .string()
    .nullable()
    .meta({ example: "Device deactivated by user" }),
  createdAt: z.iso.datetime().meta({ example: "2024-01-01T12:00:00Z" }),
  updatedAt: z.iso.datetime().meta({ example: "2024-01-01T12:00:00Z" }),
});

// Response Schemas
export const userResponseSchema = responseSchema(userSchema).register(
  registry,
  { id: "UserResponse" },
);
export const userListResponseSchema = responseSchema(
  z.object({
    users: z.array(
      userSchema.extend({
        app: z
          .object({ id: z.uuid(), name: z.string() })
          .optional()
          .meta({ example: { id: "app-xyz", name: "My App" } }),
        _count: z
          .object({ devices: z.number() })
          .optional()
          .meta({ example: { devices: 1 } }),
      }),
    ),
    pagination: z
      .object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      })
      .meta({ example: { page: 1, limit: 10, total: 1, totalPages: 1 } }),
  }),
).register(registry, { id: "UserListResponse" });

export const deviceResponseSchema = responseSchema(deviceSchema).register(
  registry,
  { id: "DeviceResponse" },
);
export const deviceListResponseSchema = responseSchema(
  z.object({
    devices: z
      .array(
        deviceSchema.extend({
          user: z
            .object({
              id: z.uuid(),
              externalUserId: z.string(),
              nickname: z.string().nullable(),
              app: z.object({ id: z.uuid(), name: z.string() }),
            })
            .optional(),
        }),
      )
      .meta({
        example: {
          devices: [
            {
              user: {
                id: "user-123",
                externalUserId: "user-123",
                nickname: "Jane",
                app: { id: "app-xyz", name: "My App" },
              },
            },
          ],
        },
      }),
    pagination: z
      .object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      })
      .meta({ example: { page: 1, limit: 10, total: 1, totalPages: 1 } }),
  }),
).register(registry, { id: "DeviceListResponse" });

export const deviceHeartbeatSchema = z
  .object({
    appId: z.string().meta({ example: "app-xyz" }),
    externalDeviceId: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .meta({ example: "ios-vendor-123" }),
    deviceId: z
      .string()
      .uuid()
      .optional()
      .meta({ example: "d1e2f3a4-b5c6-7890-abcd-ef1234567890" }),
    /** Current token, so a rotation is caught without a full re-register. */
    pushToken: z.string().optional().meta({ example: "fcm-token-123" }),
    tokenExpiresAt: z.iso.datetime().optional(),
  })
  .refine((data) => Boolean(data.externalDeviceId || data.deviceId), {
    message: "Either externalDeviceId or deviceId is required",
  })
  .register(registry, { id: "DeviceHeartbeatRequest" });
