import { Router } from "express";
import {
  createApp,
  getApps,
  getApp,
  updateApp,
  killApp,
  reviveApp,
  updateWebhookConfig,
  testWebhookEndpoint,
  createAppEnvironment,
  getAppAccess,
  inviteAppAccess,
  revokeAppInvite,
} from "./controllers/apps";
import {
  registerUser,
  registerDevice,
  getUsers,
  getUser,
  updateUserNickname,
  getDevices,
  deactivateDevice,
  activateDevice,
  deleteUser,
} from "./controllers/users";
import {
  createNotification,
  getNotifications,
  sendEvent,
  cancelNotification,
  scheduleNotification,
  forceSendNotification,
  sendTestNotification,
} from "./controllers/notifications";
import {
  createTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
} from "./controllers/templates";
import {
  createAutomation,
  getAutomations,
  getAutomation,
  updateAutomation,
  deleteAutomation,
  toggleAutomation,
  publishAutomation,
  simulateAutomation,
} from "./controllers/automations";
import {
  createAutomationTrigger,
  getAutomationTriggers,
  getAutomationTrigger,
  updateAutomationTrigger,
  deleteAutomationTrigger,
  testAutomationTrigger,
} from "./controllers/automationTriggers";
import {
  getDashboardStats,
  getAppStats,
  getNotificationTrend,
  getProviderStats,
} from "./controllers/stats";
import {
  createCredentialVersion,
  getCredentials,
  getWebSdkConfig,
  testCredential,
  activateCredential,
  deactivateCredential,
  deleteCredential,
  generateVapidKeys,
} from "./controllers/credentials";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from "./controllers/apiKeys";
import {
  configureWebhook,
  rotateSecret,
  testWebhook,
} from "./controllers/webhooks";
import {
  login,
  signup,
  logout,
  me,
  register,
  listAdmins,
  updateAdmin,
  assignAppToManager,
  removeAppFromManager,
  updateAdminApps,
  changePassword,
  setupInitialAdmin,
  getSetupStatus,
  getOnboardingStatus,
} from "./controllers/admin";
import {
  createABTest,
  getABTests,
  getABTest,
  updateABTest,
  startABTest,
  cancelABTest,
  deleteABTest,
  getABTestResults,
  duplicateABTest,
  saveABTestDraft,
  sendABTestTestPhase,
  scheduleABTestLive,
  getABTestHistory,
} from "./controllers/abtests";
import {
  createCampaign,
  getCampaigns,
  getCampaign,
  updateCampaign,
  scheduleCampaign,
  sendCampaignNow,
  cancelCampaign,
  deleteCampaign,
  uploadCampaignCSV,
  getCampaignStats,
  getAudienceEstimate,
  duplicateCampaign,
  saveCampaignDraft,
  submitForReview,
  approveCampaign,
  replayCampaignFailures,
  getDetailedAudienceEstimate,
} from "./controllers/campaigns";
import { uploadAsset, getAsset } from "./controllers/assets";
import { getCampaignReport, getProviderHealth } from "./controllers/reports";
import {
  createOrg,
  getOrgs,
  createRole,
  getRoles,
  updateRole,
  addMember,
  updateMember,
  listPermissions,
} from "./controllers/orgs";
import { getAuditLogs } from "./services/audit";
import {
  authenticateAdmin,
  requireSuperAdmin,
  requireManager,
  requireMarketing,
  canManageApp,
  requirePermission,
} from "./middleware/adminAuth";
import { cache } from "./middleware/cacheMiddleware";
import { validateRequest } from "./middleware/validateRequest";
import {
  createAppSchema,
  updateAppSchema,
  webhookConfigSchema,
  inviteAppAccessSchema,
} from "./schemas/apps";
import {
  createNotificationSchema,
  sendEventSchema,
  testNotificationSchema,
} from "./schemas/notifications";
import {
  createTemplateSchema,
  updateTemplateSchema,
} from "./schemas/templates";
import {
  createCampaignSchema,
  updateCampaignSchema,
} from "./schemas/campaigns";
import {
  createAutomationTriggerSchema,
  updateAutomationTriggerSchema,
  testAutomationTriggerSchema,
} from "./schemas/automationTriggers";
import { createApiKeySchema, rotateApiKeySchema } from "./schemas/apiKeys";
import {
  loginSchema,
  signupSchema,
  registerSchema,
  changePasswordSchema,
  updateAdminAppsSchema,
} from "./schemas/admin";
import {
  registerUserSchema,
  registerDeviceSchema,
  updateUserNicknameSchema,
} from "./schemas/users";
import {
  createABTestSchema,
  updateABTestSchema,
  abTestSendTestSchema,
  abTestScheduleLiveSchema,
} from "./schemas/abtests";
import {
  createOrgSchema,
  createRoleSchema,
  updateRoleSchema,
  addMemberSchema,
  updateMemberSchema,
} from "./schemas/orgs";
import multer from "multer";
import { uploadFileWithUrls } from "./services/storage";
import { AppError } from "./utils/response";
import { logAudit } from "./services/audit";
import { PERMISSIONS } from "./services/authz";
import { authRateLimit } from "./middleware/rateLimit";

// Upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

export const uploadRouter = Router();
uploadRouter.post(
  "/",
  authenticateAdmin,
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(400, "No file uploaded");
      }

      const uploaded = await uploadFileWithUrls(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );

      const requestedUrlMode = String(req.query.urlMode || "").toLowerCase();
      const defaultUrlMode = String(
        process.env.UPLOADS_URL_MODE || "public",
      ).toLowerCase();
      const usePresignedUrl = requestedUrlMode
        ? requestedUrlMode === "signed" || requestedUrlMode === "presigned"
        : defaultUrlMode === "signed" || defaultUrlMode === "presigned";
      const responseUrl =
        usePresignedUrl && uploaded.presignedUrl
          ? uploaded.presignedUrl
          : uploaded.url;

      const adminUser = req.adminUser;
      await logAudit({
        adminUserId: adminUser?.id,
        action: "FILE_UPLOADED",
        resource: "storage",
        details: {
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          url: uploaded.url,
        },
      });

      res.json({
        error: false,
        message: "File uploaded",
        data: {
          url: responseUrl,
          publicUrl: uploaded.url,
          presignedUrl: uploaded.presignedUrl,
          objectKey: uploaded.objectName,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ===========================================
// Admin Auth Routes (Portal)
// ===========================================
export const adminRouter = Router();

// Public routes (no auth required)
adminRouter.post("/login", authRateLimit, validateRequest(loginSchema), login);
adminRouter.post(
  "/signup",
  authRateLimit,
  validateRequest(signupSchema),
  signup,
);
adminRouter.get("/setup-status", authRateLimit, getSetupStatus);
adminRouter.post(
  "/setup",
  authRateLimit,
  validateRequest(registerSchema),
  setupInitialAdmin,
); // Guarded: 404 after first admin + optional ADMIN_SETUP_TOKEN

// Protected routes
adminRouter.get("/onboarding-status", authenticateAdmin, getOnboardingStatus);
adminRouter.post("/logout", authenticateAdmin, logout);
adminRouter.get("/me", authenticateAdmin, cache(), me);
adminRouter.post(
  "/change-password",
  authenticateAdmin,
  authRateLimit,
  validateRequest(changePasswordSchema),
  changePassword,
);

// Super admin only
adminRouter.post(
  "/users",
  authenticateAdmin,
  requireSuperAdmin,
  validateRequest(registerSchema),
  register,
);
adminRouter.get(
  "/users",
  authenticateAdmin,
  requireSuperAdmin,
  cache(),
  listAdmins,
);
adminRouter.patch(
  "/users/:id",
  authenticateAdmin,
  requireSuperAdmin,
  updateAdmin,
);
adminRouter.post(
  "/users/assign-app",
  authenticateAdmin,
  requireSuperAdmin,
  assignAppToManager,
);
adminRouter.delete(
  "/users/:adminUserId/apps/:appId",
  authenticateAdmin,
  requireSuperAdmin,
  removeAppFromManager,
);
adminRouter.put(
  "/users/:id/apps",
  authenticateAdmin,
  requireSuperAdmin,
  validateRequest(updateAdminAppsSchema),
  updateAdminApps,
);

// ===========================================
// App Routes
// ===========================================
export const appRouter = Router();
appRouter.post(
  "/",
  authenticateAdmin,
  requirePermission(PERMISSIONS.APP_CREATE),
  validateRequest(createAppSchema),
  createApp,
);
appRouter.get("/", authenticateAdmin, cache(), getApps);
appRouter.get("/:id", authenticateAdmin, cache(), getApp);
appRouter.put(
  "/:id",
  authenticateAdmin,
  requireManager,
  canManageApp,
  validateRequest(updateAppSchema),
  updateApp,
);
appRouter.post("/:id/kill", authenticateAdmin, requireSuperAdmin, killApp);
appRouter.post("/:id/revive", authenticateAdmin, requireSuperAdmin, reviveApp);
appRouter.put(
  "/:id/webhook",
  authenticateAdmin,
  requireManager,
  canManageApp,
  validateRequest(webhookConfigSchema),
  updateWebhookConfig,
);
appRouter.post(
  "/:id/webhook/test",
  authenticateAdmin,
  requireManager,
  canManageApp,
  testWebhookEndpoint,
);
appRouter.post(
  "/:id/env",
  authenticateAdmin,
  requireManager,
  canManageApp,
  createAppEnvironment,
);
appRouter.get(
  "/:id/access",
  authenticateAdmin,
  requireManager,
  canManageApp,
  getAppAccess,
);
appRouter.post(
  "/:id/invites",
  authenticateAdmin,
  requireManager,
  canManageApp,
  validateRequest(inviteAppAccessSchema),
  inviteAppAccess,
);
appRouter.delete(
  "/:id/invites/:inviteId",
  authenticateAdmin,
  requireManager,
  canManageApp,
  revokeAppInvite,
);

// App-scoped machine API keys
appRouter.get(
  "/:appId/api-keys",
  authenticateAdmin,
  requireManager,
  canManageApp,
  listApiKeys,
);
appRouter.post(
  "/:appId/api-keys",
  authenticateAdmin,
  requireManager,
  canManageApp,
  validateRequest(createApiKeySchema),
  createApiKey,
);
appRouter.post(
  "/:appId/api-keys/:keyId/revoke",
  authenticateAdmin,
  requireManager,
  canManageApp,
  revokeApiKey,
);
appRouter.post(
  "/:appId/api-keys/:keyId/rotate",
  authenticateAdmin,
  requireManager,
  canManageApp,
  validateRequest(rotateApiKeySchema),
  rotateApiKey,
);

// Per-app credential management (requires admin auth + role check)
// Per-app credential management (Phase 2: Versioning)
appRouter.get(
  "/:appId/env/:env/credentials",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CREDENTIAL_READ),
  getCredentials,
);
appRouter.get(
  "/:appId/env/:env/credentials/view",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CREDENTIAL_READ),
  getWebSdkConfig,
);
appRouter.post(
  "/:appId/env/:env/credentials/:provider",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CREDENTIAL_WRITE),
  createCredentialVersion,
);
// Static credential routes MUST come before wildcard :credentialVersionId
appRouter.post(
  "/credentials/generate-vapid",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CREDENTIAL_WRITE),
  generateVapidKeys,
);
appRouter.post(
  "/credentials/:credentialVersionId/test",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CREDENTIAL_TEST),
  testCredential,
);
appRouter.post(
  "/credentials/:credentialVersionId/activate",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CREDENTIAL_ROTATE),
  activateCredential,
);
appRouter.post(
  "/credentials/:credentialId/deactivate",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CREDENTIAL_ROTATE),
  deactivateCredential,
);
appRouter.delete(
  "/credentials/:credentialId",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CREDENTIAL_WRITE),
  deleteCredential,
);

// Webhook management (Phase 2: Signing & Hardening)
appRouter.put(
  "/:appId/env/:env/webhooks",
  authenticateAdmin,
  requirePermission(PERMISSIONS.WEBHOOK_CONFIGURE),
  configureWebhook,
);
appRouter.post(
  "/:appId/env/:env/webhooks/rotate-secret",
  authenticateAdmin,
  requirePermission(PERMISSIONS.WEBHOOK_ROTATE_SECRET),
  rotateSecret,
);
appRouter.post(
  "/:appId/env/:env/webhooks/test",
  authenticateAdmin,
  requirePermission(PERMISSIONS.WEBHOOK_CONFIGURE),
  testWebhook,
);

// ===========================================
// Other Routes (API Key auth)
// ===========================================
export const userRouter = Router();
userRouter.get("/", authenticateAdmin, requireMarketing, cache(), getUsers);
userRouter.get("/:id", authenticateAdmin, requireMarketing, cache(), getUser);
userRouter.patch(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  validateRequest(updateUserNicknameSchema),
  updateUserNickname,
);
userRouter.delete("/:id", authenticateAdmin, requireManager, deleteUser);
userRouter.post("/", validateRequest(registerUserSchema), registerUser);
userRouter.post(
  "/device",
  validateRequest(registerDeviceSchema),
  registerDevice,
);

export const deviceRouter = Router();
deviceRouter.get("/", authenticateAdmin, requireMarketing, cache(), getDevices);
deviceRouter.patch(
  "/:id/deactivate",
  authenticateAdmin,
  requireMarketing,
  deactivateDevice,
);
deviceRouter.post(
  "/:id/deactivate",
  authenticateAdmin,
  requireMarketing,
  deactivateDevice,
);
deviceRouter.patch(
  "/:id/activate",
  authenticateAdmin,
  requireMarketing,
  activateDevice,
);
deviceRouter.post(
  "/:id/activate",
  authenticateAdmin,
  requireMarketing,
  activateDevice,
);

export const notificationRouter = Router();
notificationRouter.get(
  "/",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getNotifications,
);
notificationRouter.post(
  "/",
  validateRequest(createNotificationSchema),
  createNotification,
);
notificationRouter.post(
  "/test",
  validateRequest(testNotificationSchema),
  sendTestNotification,
);
notificationRouter.post("/:id/cancel", cancelNotification);
notificationRouter.post("/:id/schedule", scheduleNotification);
notificationRouter.post("/:id/force-send", forceSendNotification);

export const eventRouter = Router();
eventRouter.post("/:eventName", validateRequest(sendEventSchema), sendEvent);

export const templateRouter = Router();
// Templates accessible to all admin roles (MARKETING_MANAGER can create/manage templates)
templateRouter.post(
  "/",
  authenticateAdmin,
  requireMarketing,
  validateRequest(createTemplateSchema),
  createTemplate,
);
templateRouter.get("/", cache(), getTemplates); // Public read for API consumers
templateRouter.get("/:id", cache(), getTemplate);
templateRouter.put(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  validateRequest(updateTemplateSchema),
  updateTemplate,
);
templateRouter.delete(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  deleteTemplate,
);

// ===========================================
// Automation Routes
// ===========================================
export const automationRouter = Router();
automationRouter.post(
  "/",
  authenticateAdmin,
  requireMarketing,
  createAutomation,
);
automationRouter.get(
  "/",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getAutomations,
);
automationRouter.get(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getAutomation,
);
automationRouter.put(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  updateAutomation,
);
automationRouter.delete(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  deleteAutomation,
);
automationRouter.post(
  "/:id/toggle",
  authenticateAdmin,
  requireMarketing,
  toggleAutomation,
);
automationRouter.post(
  "/:id/publish",
  authenticateAdmin,
  requireMarketing,
  publishAutomation,
);
automationRouter.post(
  "/:id/simulate",
  authenticateAdmin,
  requireMarketing,
  simulateAutomation,
);

// ===========================================
// Automation Trigger Routes
// ===========================================
export const automationTriggerRouter = Router();
automationTriggerRouter.post(
  "/",
  authenticateAdmin,
  requireMarketing,
  validateRequest(createAutomationTriggerSchema),
  createAutomationTrigger,
);
automationTriggerRouter.get(
  "/",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getAutomationTriggers,
);
automationTriggerRouter.get(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getAutomationTrigger,
);
automationTriggerRouter.put(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  validateRequest(updateAutomationTriggerSchema),
  updateAutomationTrigger,
);
automationTriggerRouter.delete(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  deleteAutomationTrigger,
);
automationTriggerRouter.post(
  "/:id/test",
  authenticateAdmin,
  requireMarketing,
  validateRequest(testAutomationTriggerSchema),
  testAutomationTrigger,
);

// ===========================================
// A/B Testing Routes (Admin Portal)
// ===========================================
export const abTestRouter = Router();
abTestRouter.post(
  "/",
  authenticateAdmin,
  requireMarketing,
  validateRequest(createABTestSchema),
  createABTest,
);
abTestRouter.get("/", authenticateAdmin, requireMarketing, cache(), getABTests);
abTestRouter.get(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getABTest,
);
abTestRouter.put(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  validateRequest(updateABTestSchema),
  updateABTest,
);
abTestRouter.put(
  "/:id/draft",
  authenticateAdmin,
  requireMarketing,
  saveABTestDraft,
);
abTestRouter.post(
  "/:id/start",
  authenticateAdmin,
  requireMarketing,
  startABTest,
);
abTestRouter.post(
  "/:id/cancel",
  authenticateAdmin,
  requireMarketing,
  cancelABTest,
);
abTestRouter.post(
  "/:id/duplicate",
  authenticateAdmin,
  requireMarketing,
  duplicateABTest,
);
abTestRouter.post(
  "/:id/test",
  authenticateAdmin,
  requireMarketing,
  validateRequest(abTestSendTestSchema),
  sendABTestTestPhase,
);
abTestRouter.post(
  "/:id/schedule-live",
  authenticateAdmin,
  requireMarketing,
  validateRequest(abTestScheduleLiveSchema),
  scheduleABTestLive,
);
abTestRouter.delete("/:id", authenticateAdmin, requireMarketing, deleteABTest);
abTestRouter.get(
  "/:id/results",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getABTestResults,
);
abTestRouter.get(
  "/:id/history",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getABTestHistory,
);

// ===========================================
// Campaign Routes (Bulk Notifications)
// ===========================================
export const campaignRouter = Router();
campaignRouter.post(
  "/",
  authenticateAdmin,
  requireMarketing,
  validateRequest(createCampaignSchema),
  createCampaign,
);
campaignRouter.get(
  "/",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getCampaigns,
);
campaignRouter.post(
  "/audience-estimate",
  authenticateAdmin,
  requireMarketing,
  getAudienceEstimate,
);
campaignRouter.get(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getCampaign,
);
campaignRouter.put(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  validateRequest(updateCampaignSchema),
  updateCampaign,
);
campaignRouter.put(
  "/:id/draft",
  authenticateAdmin,
  requireMarketing,
  saveCampaignDraft,
);
campaignRouter.post(
  "/:id/schedule",
  authenticateAdmin,
  requireMarketing,
  scheduleCampaign,
);
campaignRouter.post(
  "/:id/send",
  authenticateAdmin,
  requireMarketing,
  sendCampaignNow,
);
campaignRouter.post(
  "/:id/cancel",
  authenticateAdmin,
  requireMarketing,
  cancelCampaign,
);
campaignRouter.post(
  "/:id/duplicate",
  authenticateAdmin,
  requireMarketing,
  duplicateCampaign,
);
campaignRouter.delete(
  "/:id",
  authenticateAdmin,
  requireMarketing,
  deleteCampaign,
);
campaignRouter.post(
  "/:id/csv",
  authenticateAdmin,
  requireMarketing,
  uploadCampaignCSV,
);
campaignRouter.get(
  "/:id/stats",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getCampaignStats,
);

// Phase 3: Campaign Approvals & Workflows
campaignRouter.post(
  "/:id/submit-review",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CAMPAIGN_SUBMIT_REVIEW),
  submitForReview,
);
campaignRouter.post(
  "/:id/approve",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CAMPAIGN_APPROVE),
  approveCampaign,
);
campaignRouter.post(
  "/:id/replay-failures",
  authenticateAdmin,
  requirePermission(PERMISSIONS.OPS_REPLAY),
  replayCampaignFailures,
);
// Replaces simple estimate with detailed one (or we keep both, pointing new one to separate path)
campaignRouter.post(
  "/estimate",
  authenticateAdmin,
  requirePermission(PERMISSIONS.CAMPAIGN_CREATE),
  getDetailedAudienceEstimate,
);

// ===========================================
// Asset Routes
// ===========================================
export const assetRouter = Router();
assetRouter.post("/upload", upload.single("file"), uploadAsset);
assetRouter.get("/:id", authenticateAdmin, cache(), getAsset);

// ===========================================
// Report Routes
// ===========================================
export const reportRouter = Router();
// Provide centralized reporting endpoint (Campaign Report)
reportRouter.get(
  "/campaign/:id",
  authenticateAdmin,
  requirePermission(PERMISSIONS.AUDIT_READ),
  cache(),
  getCampaignReport,
);
// Provider Health
reportRouter.get(
  "/provider-health",
  authenticateAdmin,
  requirePermission(PERMISSIONS.STATS_READ),
  cache(),
  getProviderHealth,
);

// ===========================================
// Stats Routes (Admin Portal - all roles can view)
// ===========================================
export const statsRouter = Router();
statsRouter.get(
  "/dashboard",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getDashboardStats,
);
statsRouter.get(
  "/apps",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getAppStats,
);
statsRouter.get(
  "/trend",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getNotificationTrend,
);
statsRouter.get(
  "/providers",
  authenticateAdmin,
  requireMarketing,
  cache(),
  getProviderStats,
);

// ===========================================
// Audit Log Routes (Super Admin Only)
// ===========================================
export const auditRouter = Router();
auditRouter.get(
  "/",
  authenticateAdmin,
  requireSuperAdmin,
  cache(),
  async (req, res, next) => {
    try {
      const { appId, action, adminUserId, startDate, endDate, limit, offset } =
        req.query;

      const logs = await getAuditLogs({
        appId: appId as string,
        action: action as any,
        adminUserId: adminUserId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json({ error: false, message: "Success", data: logs });
    } catch (error) {
      next(error);
    }
  },
);

// ===========================================
// Organization Routes (New RBAC)
// ===========================================
export const orgRouter = Router();

// Organization management
orgRouter.post(
  "/",
  authenticateAdmin,
  requirePermission(PERMISSIONS.ORG_CREATE),
  validateRequest(createOrgSchema),
  createOrg,
);
orgRouter.get("/", authenticateAdmin, cache(), getOrgs);

// Role management within organization
orgRouter.post(
  "/:orgId/roles",
  authenticateAdmin,
  requirePermission(PERMISSIONS.ORG_UPDATE),
  validateRequest(createRoleSchema),
  createRole,
);
orgRouter.get("/:orgId/roles", authenticateAdmin, cache(), getRoles);
orgRouter.put(
  "/:orgId/roles/:roleId",
  authenticateAdmin,
  requirePermission(PERMISSIONS.ORG_UPDATE),
  validateRequest(updateRoleSchema),
  updateRole,
);

// Member management within organization
orgRouter.post(
  "/:orgId/members",
  authenticateAdmin,
  requirePermission(PERMISSIONS.ORG_UPDATE),
  validateRequest(addMemberSchema),
  addMember,
);
orgRouter.put(
  "/:orgId/members/:memberId",
  authenticateAdmin,
  requirePermission(PERMISSIONS.ORG_UPDATE),
  validateRequest(updateMemberSchema),
  updateMember,
);

// List all available permissions
orgRouter.get("/permissions", authenticateAdmin, cache(), listPermissions);
