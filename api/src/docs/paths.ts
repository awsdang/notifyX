import { pathRegistry } from "./path-registry";
import {
  createAppSchema,
  appResponseSchema,
  appListResponseSchema,
  updateAppSchema,
  webhookConfigResponseSchema,
  killAppResponseSchema,
  testWebhookResponseSchema,
} from "../schemas/apps";
import {
  registerUserSchema,
  registerDeviceSchema,
  userResponseSchema,
  userListResponseSchema,
  deviceResponseSchema,
  deviceListResponseSchema,
} from "../schemas/users";
import {
  createNotificationSchema,
  sendEventSchema,
  notificationResponseSchema,
  notificationHistoryResponseSchema,
  sendEventResponseSchema,
  testNotificationResponseSchema,
} from "../schemas/notifications";
import {
  createTemplateSchema,
  updateTemplateSchema,
  templateResponseSchema,
  templateListResponseSchema,
} from "../schemas/templates";
import {
  createAutomationTriggerSchema,
  updateAutomationTriggerSchema,
  automationTriggerResponseSchema,
  automationTriggerListResponseSchema,
  testAutomationTriggerSchema,
  automationTriggerTestResponseSchema,
} from "../schemas/automationTriggers";
import {
  createABTestSchema,
  updateABTestSchema,
  abTestResponseSchema,
  abTestListResponseSchema,
  abTestResultsResponseSchema,
} from "../schemas/abtests";
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignResponseSchema,
  campaignListResponseSchema,
  campaignStatsResponseSchema,
  audienceEstimateResponseSchema,
  detailedAudienceEstimateResponseSchema,
} from "../schemas/campaigns";
import {
  loginSchema,
  registerSchema,
  loginResponseSchema,
  meResponseSchema,
  adminUserResponseSchema,
  adminUserListResponseSchema,
  assignmentResponseSchema,
  changePasswordSchema,
} from "../schemas/admin";
import {
  createOrgSchema,
  createRoleSchema,
  updateRoleSchema,
  addMemberSchema,
  updateMemberSchema,
  orgResponseSchema,
  orgListResponseSchema,
  roleResponseSchema,
  roleListResponseSchema,
  memberResponseSchema,
  permissionListResponseSchema,
} from "../schemas/orgs";
import { assetResponseSchema } from "../schemas/assets";
import { z } from "zod";

// Note: Security schemes are now handled in openapi.ts or can be registered if we extend PathRegistry

// --- Apps ---
pathRegistry.registerPath({
  method: "post",
  path: "/apps",
  description: "Create a new application",
  tags: ["Apps"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createAppSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "App created successfully",
      content: {
        "application/json": {
          schema: appResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/apps",
  description: "Get all applications",
  tags: ["Apps"],
  responses: {
    200: {
      description: "List of apps",
      content: {
        "application/json": {
          schema: appListResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/apps/{id}",
  description: "Get an application by ID",
  tags: ["Apps"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "App details",
      content: {
        "application/json": {
          schema: appResponseSchema,
        },
      },
    },
    404: {
      description: "App not found",
    },
  },
});

pathRegistry.registerPath({
  method: "put",
  path: "/apps/{id}",
  description: "Update application",
  tags: ["Apps"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: updateAppSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "App updated",
      content: {
        "application/json": {
          schema: appResponseSchema,
        },
      },
    },
  },
});

// --- Users ---
pathRegistry.registerPath({
  method: "post",
  path: "/users",
  description: "Register or update a user",
  tags: ["Users"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: registerUserSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "User registered",
      content: {
        "application/json": {
          schema: userResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/users",
  description: "Get all users",
  tags: ["Users"],
  request: {
    query: z.object({
      appId: z.string().uuid().optional(),
      search: z.string().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "List of users",
      content: {
        "application/json": {
          schema: userListResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "post",
  path: "/users/device",
  description: "Register a device",
  tags: ["Users"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: registerDeviceSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Device registered",
      content: {
        "application/json": {
          schema: deviceResponseSchema,
        },
      },
    },
  },
});

// --- Notifications ---
pathRegistry.registerPath({
  method: "get",
  path: "/notifications/history",
  description:
    "List notification history for a user or device within an app, with pagination, sorting, and filtering.",
  tags: ["Notifications"],
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  request: {
    query: z.object({
      appId: z.string(),
      userId: z.string().optional(),
      deviceId: z.string().optional(),
      type: z.string().optional(),
      provider: z.string().optional(),
      status: z.string().optional(),
      deliveryStatus: z.string().optional(),
      notificationStatus: z.string().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      sortBy: z
        .enum([
          "createdAt",
          "deliveryStatus",
          "notificationStatus",
          "provider",
          "sendAt",
          "sentAt",
          "status",
          "type",
        ])
        .optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    }),
  },
  responses: {
    200: {
      description: "Notification history",
      content: {
        "application/json": {
          schema: notificationHistoryResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "post",
  path: "/notifications",
  description: "Create a notification",
  tags: ["Notifications"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createNotificationSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Notification created",
      content: {
        "application/json": {
          schema: notificationResponseSchema,
        },
      },
    },
  },
});

// --- Events ---
pathRegistry.registerPath({
  method: "post",
  path: "/events/{eventName}",
  description: "Send an event",
  tags: ["Events"],
  request: {
    params: z.object({ eventName: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: sendEventSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Event processed",
      content: {
        "application/json": {
          schema: sendEventResponseSchema,
        },
      },
    },
  },
});

// --- Templates ---
pathRegistry.registerPath({
  method: "post",
  path: "/templates",
  description: "Create a template",
  tags: ["Templates"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createTemplateSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Template created",
      content: {
        "application/json": {
          schema: templateResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/templates",
  description: "Get templates",
  tags: ["Templates"],
  request: {
    query: z.object({ appId: z.string().optional() }),
  },
  responses: {
    200: {
      description: "List of templates",
      content: {
        "application/json": {
          schema: templateListResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/templates/{id}",
  description: "Get template by ID",
  tags: ["Templates"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "Template details",
      content: {
        "application/json": {
          schema: templateResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "put",
  path: "/templates/{id}",
  description: "Update template",
  tags: ["Templates"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: updateTemplateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Template updated",
      content: {
        "application/json": {
          schema: templateResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "delete",
  path: "/templates/{id}",
  description: "Delete template",
  tags: ["Templates"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: "Template deleted" },
  },
});

// --- Automation Triggers ---
pathRegistry.registerPath({
  method: "post",
  path: "/automation-triggers",
  description: "Create an automation trigger for an app",
  tags: ["Automation Triggers"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createAutomationTriggerSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Automation trigger created",
      content: {
        "application/json": {
          schema: automationTriggerResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/automation-triggers",
  description: "List automation triggers",
  tags: ["Automation Triggers"],
  request: {
    query: z.object({
      appId: z.string().optional(),
      includeInactive: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Automation trigger list",
      content: {
        "application/json": {
          schema: automationTriggerListResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/automation-triggers/{id}",
  description: "Get automation trigger by ID",
  tags: ["Automation Triggers"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Automation trigger details",
      content: {
        "application/json": {
          schema: automationTriggerResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "put",
  path: "/automation-triggers/{id}",
  description: "Update automation trigger by ID",
  tags: ["Automation Triggers"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: updateAutomationTriggerSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Automation trigger updated",
      content: {
        "application/json": {
          schema: automationTriggerResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "post",
  path: "/automation-triggers/{id}/test",
  description: "Run a test invocation for the trigger",
  tags: ["Automation Triggers"],
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: testAutomationTriggerSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Trigger test queued",
      content: {
        "application/json": {
          schema: automationTriggerTestResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "delete",
  path: "/automation-triggers/{id}",
  description: "Delete automation trigger by ID",
  tags: ["Automation Triggers"],
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Automation trigger deleted",
    },
  },
});

// --- Admin ---
pathRegistry.registerPath({
  method: "post",
  path: "/admin/login",
  description: "Admin login",
  tags: ["Admin"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: loginSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Login successful",
      content: {
        "application/json": {
          schema: loginResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/admin/me",
  description: "Get current admin info",
  tags: ["Admin"],
  responses: {
    200: {
      description: "Admin info",
      content: {
        "application/json": {
          schema: meResponseSchema,
        },
      },
    },
  },
});

// --- Campaigns ---
pathRegistry.registerPath({
  method: "post",
  path: "/campaigns",
  description: "Create a campaign",
  tags: ["Campaigns"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createCampaignSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Campaign created",
      content: {
        "application/json": {
          schema: campaignResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/campaigns",
  description: "List campaigns",
  tags: ["Campaigns"],
  request: {
    query: z.object({
      appId: z.string().uuid().optional(),
      status: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "List of campaigns",
      content: {
        "application/json": {
          schema: campaignListResponseSchema,
        },
      },
    },
  },
});

// --- AB Tests ---
pathRegistry.registerPath({
  method: "post",
  path: "/abtests",
  description: "Create an AB test",
  tags: ["AB Tests"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createABTestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "AB test created",
      content: {
        "application/json": {
          schema: abTestResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/abtests",
  description: "List AB tests",
  tags: ["AB Tests"],
  request: {
    query: z.object({ appId: z.string().uuid().optional() }),
  },
  responses: {
    200: {
      description: "List of AB tests",
      content: {
        "application/json": {
          schema: abTestListResponseSchema,
        },
      },
    },
  },
});

// --- Organizations ---
pathRegistry.registerPath({
  method: "post",
  path: "/orgs",
  description: "Create an organization",
  tags: ["Organizations"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createOrgSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Organization created",
      content: {
        "application/json": {
          schema: orgResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "get",
  path: "/orgs",
  description: "List organizations",
  tags: ["Organizations"],
  responses: {
    200: {
      description: "List of organizations",
      content: {
        "application/json": {
          schema: orgListResponseSchema,
        },
      },
    },
  },
});

// --- App Management ---
pathRegistry.registerPath({
  method: "post",
  path: "/apps/{id}/kill",
  description: "Emergency kill switch for an app",
  tags: ["Apps"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "App killed successfully",
      content: {
        "application/json": {
          schema: killAppResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "put",
  path: "/apps/{id}/webhook",
  description: "Update app webhook configuration",
  tags: ["Apps"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            webhookUrl: z.string().url().nullable().optional(),
            webhookSecret: z.string().min(16).max(256).nullable().optional(),
            webhookEnabled: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Webhook config updated",
      content: {
        "application/json": {
          schema: webhookConfigResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "post",
  path: "/apps/{id}/webhook/test",
  description: "Test app webhook",
  tags: ["Apps"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "Webhook test result",
      content: {
        "application/json": {
          schema: testWebhookResponseSchema,
        },
      },
    },
  },
});

// --- Campaign Detailed ---
pathRegistry.registerPath({
  method: "get",
  path: "/campaigns/{id}/stats",
  description: "Get campaign statistics",
  tags: ["Campaigns"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "Campaign statistics",
      content: {
        "application/json": {
          schema: campaignStatsResponseSchema,
        },
      },
    },
  },
});

pathRegistry.registerPath({
  method: "post",
  path: "/campaigns/estimate",
  description: "Get audience estimate",
  tags: ["Campaigns"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            appId: z.string().uuid(),
            targetingMode: z.string().optional(),
            userIds: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Audience estimate",
      content: {
        "application/json": {
          schema: audienceEstimateResponseSchema,
        },
      },
    },
  },
});

// --- AB Test Results ---
pathRegistry.registerPath({
  method: "get",
  path: "/abtests/{id}/results",
  description: "Get AB test results",
  tags: ["AB Tests"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: "AB test results",
      content: {
        "application/json": {
          schema: abTestResultsResponseSchema,
        },
      },
    },
  },
});

// --- Assets ---
pathRegistry.registerPath({
  method: "post",
  path: "/assets/upload",
  description: "Upload an asset (CSV/Image)",
  tags: ["Assets"],
  request: {
    body: {
      description: "Multipart form data with file and appId",
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().describe("File to upload"),
            appId: z.string().uuid(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Asset uploaded",
      content: {
        "application/json": {
          schema: assetResponseSchema,
        },
      },
    },
  },
});
