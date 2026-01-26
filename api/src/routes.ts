import { Router } from 'express';
import {
    createApp,
    getApps,
    getApp,
    updateApp,
    killApp,
    reviveApp,
    updateWebhookConfig,
    testWebhookEndpoint,
    createAppEnvironment
} from './controllers/apps';
import { registerUser, registerDevice, getUsers, getUser, getDevices, deactivateDevice, deleteUser } from './controllers/users';
import {
    createNotification,
    sendEvent,
    cancelNotification,
    scheduleNotification,
    forceSendNotification,
    sendTestNotification
} from './controllers/notifications';
import { createTemplate, getTemplates, getTemplate, updateTemplate, deleteTemplate } from './controllers/templates';
import { getDashboardStats, getAppStats, getNotificationTrend, getProviderStats } from './controllers/stats';
import {
    createCredentialVersion,
    getCredentials,
    testCredential,
    activateCredential
} from './controllers/credentials';
import {
    configureWebhook,
    rotateSecret,
    testWebhook
} from './controllers/webhooks';
import {
    login,
    logout,
    me,
    register,
    listAdmins,
    updateAdmin,
    assignAppToManager,
    removeAppFromManager,
    changePassword,
    setupInitialAdmin,
} from './controllers/admin';
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
} from './controllers/abtests';
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
    getDetailedAudienceEstimate
} from './controllers/campaigns';
import { uploadAsset, getAsset } from './controllers/assets';
import { getCampaignReport, getProviderHealth } from './controllers/reports';
import {
    createOrg,
    getOrgs,
    createRole,
    getRoles,
    updateRole,
    addMember,
    updateMember,
    listPermissions,
} from './controllers/orgs';
import { getAuditLogs } from './services/audit';
import { authenticateAdmin, requireSuperAdmin, requireManager, requireMarketing, canManageApp, requirePermission } from './middleware/adminAuth';
import multer from 'multer';
import { uploadFile } from './services/storage';
import { AppError } from './utils/response';
import { logAudit } from './services/audit';
import { PERMISSIONS } from './services/authz';

// Upload configuration
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

export const uploadRouter = Router();
uploadRouter.post('/', authenticateAdmin, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            throw new AppError(400, 'No file uploaded');
        }

        const url = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);

        const adminUser = (req as any).adminUser;
        await logAudit({
            adminUserId: adminUser?.id,
            action: 'FILE_UPLOADED',
            resource: 'storage',
            details: {
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
                url
            },
        });

        res.json({ success: true, url });
    } catch (error) {
        next(error);
    }
});

// ===========================================
// Admin Auth Routes (Portal)
// ===========================================
export const adminRouter = Router();

// Public routes (no auth required)
adminRouter.post('/login', login);
adminRouter.post('/setup', setupInitialAdmin); // Only works if no admins exist

// Protected routes
adminRouter.post('/logout', authenticateAdmin, logout);
adminRouter.get('/me', authenticateAdmin, me);
adminRouter.post('/change-password', authenticateAdmin, changePassword);

// Super admin only
adminRouter.post('/users', authenticateAdmin, requireSuperAdmin, register);
adminRouter.get('/users', authenticateAdmin, requireSuperAdmin, listAdmins);
adminRouter.patch('/users/:id', authenticateAdmin, requireSuperAdmin, updateAdmin);
adminRouter.post('/users/assign-app', authenticateAdmin, requireSuperAdmin, assignAppToManager);
adminRouter.delete('/users/:adminUserId/apps/:appId', authenticateAdmin, requireSuperAdmin, removeAppFromManager);

// ===========================================
// App Routes
// ===========================================
export const appRouter = Router();
appRouter.post('/', createApp);
appRouter.get('/', getApps);
appRouter.get('/:id', getApp);
appRouter.put('/:id', authenticateAdmin, requireManager, canManageApp, updateApp);
appRouter.post('/:id/kill', authenticateAdmin, requireSuperAdmin, killApp);
appRouter.post('/:id/revive', authenticateAdmin, requireSuperAdmin, reviveApp);
appRouter.put('/:id/webhook', authenticateAdmin, requireManager, canManageApp, updateWebhookConfig);
appRouter.post('/:id/webhook/test', authenticateAdmin, requireManager, canManageApp, testWebhookEndpoint);
appRouter.post('/:id/env', authenticateAdmin, requireManager, canManageApp, createAppEnvironment);

// Per-app credential management (requires admin auth + role check)
// Per-app credential management (Phase 2: Versioning)
appRouter.get('/:appId/env/:env/credentials', authenticateAdmin, requirePermission(PERMISSIONS.CREDENTIAL_READ), getCredentials);
appRouter.post('/:appId/env/:env/credentials/:provider', authenticateAdmin, requirePermission(PERMISSIONS.CREDENTIAL_WRITE), createCredentialVersion);
appRouter.post('/credentials/:credentialVersionId/test', authenticateAdmin, requirePermission(PERMISSIONS.CREDENTIAL_TEST), testCredential);
appRouter.post('/credentials/:credentialVersionId/activate', authenticateAdmin, requirePermission(PERMISSIONS.CREDENTIAL_ROTATE), activateCredential);

// Webhook management (Phase 2: Signing & Hardening)
appRouter.put('/:appId/env/:env/webhooks', authenticateAdmin, requirePermission(PERMISSIONS.WEBHOOK_CONFIGURE), configureWebhook);
appRouter.post('/:appId/env/:env/webhooks/rotate-secret', authenticateAdmin, requirePermission(PERMISSIONS.WEBHOOK_ROTATE_SECRET), rotateSecret);
appRouter.post('/:appId/env/:env/webhooks/test', authenticateAdmin, requirePermission(PERMISSIONS.WEBHOOK_CONFIGURE), testWebhook);

// ===========================================
// Other Routes (API Key auth)
// ===========================================
export const userRouter = Router();
userRouter.get('/', authenticateAdmin, requireMarketing, getUsers);
userRouter.get('/:id', authenticateAdmin, requireMarketing, getUser);
userRouter.delete('/:id', authenticateAdmin, requireManager, deleteUser);
userRouter.post('/', registerUser);
userRouter.post('/device', registerDevice);

export const deviceRouter = Router();
deviceRouter.get('/', authenticateAdmin, requireMarketing, getDevices);
deviceRouter.patch('/:id/deactivate', authenticateAdmin, requireManager, deactivateDevice);

export const notificationRouter = Router();
notificationRouter.post('/', createNotification);
notificationRouter.post('/test', sendTestNotification);
notificationRouter.post('/:id/cancel', cancelNotification);
notificationRouter.post('/:id/schedule', scheduleNotification);
notificationRouter.post('/:id/force-send', forceSendNotification);

export const eventRouter = Router();
eventRouter.post('/:eventName', sendEvent);

export const templateRouter = Router();
// Templates accessible to all admin roles (MARKETING_MANAGER can create/manage templates)
templateRouter.post('/', authenticateAdmin, requireMarketing, createTemplate);
templateRouter.get('/', getTemplates);  // Public read for API consumers
templateRouter.get('/:id', getTemplate);
templateRouter.put('/:id', authenticateAdmin, requireMarketing, updateTemplate);
templateRouter.delete('/:id', authenticateAdmin, requireMarketing, deleteTemplate);

// ===========================================
// A/B Testing Routes (Admin Portal)
// ===========================================
export const abTestRouter = Router();
abTestRouter.post('/', authenticateAdmin, requireMarketing, createABTest);
abTestRouter.get('/', authenticateAdmin, requireMarketing, getABTests);
abTestRouter.get('/:id', authenticateAdmin, requireMarketing, getABTest);
abTestRouter.put('/:id', authenticateAdmin, requireMarketing, updateABTest);
abTestRouter.put('/:id/draft', authenticateAdmin, requireMarketing, saveABTestDraft);
abTestRouter.post('/:id/start', authenticateAdmin, requireMarketing, startABTest);
abTestRouter.post('/:id/cancel', authenticateAdmin, requireMarketing, cancelABTest);
abTestRouter.post('/:id/duplicate', authenticateAdmin, requireMarketing, duplicateABTest);
abTestRouter.delete('/:id', authenticateAdmin, requireMarketing, deleteABTest);
abTestRouter.get('/:id/results', authenticateAdmin, requireMarketing, getABTestResults);

// ===========================================
// Campaign Routes (Bulk Notifications)
// ===========================================
export const campaignRouter = Router();
campaignRouter.post('/', authenticateAdmin, requireMarketing, createCampaign);
campaignRouter.get('/', authenticateAdmin, requireMarketing, getCampaigns);
campaignRouter.post('/audience-estimate', authenticateAdmin, requireMarketing, getAudienceEstimate);
campaignRouter.get('/:id', authenticateAdmin, requireMarketing, getCampaign);
campaignRouter.put('/:id', authenticateAdmin, requireMarketing, updateCampaign);
campaignRouter.put('/:id/draft', authenticateAdmin, requireMarketing, saveCampaignDraft);
campaignRouter.post('/:id/schedule', authenticateAdmin, requireMarketing, scheduleCampaign);
campaignRouter.post('/:id/send', authenticateAdmin, requireMarketing, sendCampaignNow);
campaignRouter.post('/:id/cancel', authenticateAdmin, requireMarketing, cancelCampaign);
campaignRouter.post('/:id/duplicate', authenticateAdmin, requireMarketing, duplicateCampaign);
campaignRouter.delete('/:id', authenticateAdmin, requireMarketing, deleteCampaign);
campaignRouter.post('/:id/csv', authenticateAdmin, requireMarketing, uploadCampaignCSV);
campaignRouter.post('/:id/csv', authenticateAdmin, requireMarketing, uploadCampaignCSV);
campaignRouter.get('/:id/stats', authenticateAdmin, requireMarketing, getCampaignStats);

// Phase 3: Campaign Approvals & Workflows
campaignRouter.post('/:id/submit-review', authenticateAdmin, requirePermission(PERMISSIONS.CAMPAIGN_SUBMIT_REVIEW), submitForReview);
campaignRouter.post('/:id/approve', authenticateAdmin, requirePermission(PERMISSIONS.CAMPAIGN_APPROVE), approveCampaign);
campaignRouter.post('/:id/replay-failures', authenticateAdmin, requirePermission(PERMISSIONS.OPS_REPLAY), replayCampaignFailures);
// Replaces simple estimate with detailed one (or we keep both, pointing new one to separate path)
campaignRouter.post('/estimate', authenticateAdmin, requirePermission(PERMISSIONS.CAMPAIGN_CREATE), getDetailedAudienceEstimate);

// ===========================================
// Asset Routes
// ===========================================
export const assetRouter = Router();
assetRouter.post('/upload', authenticateAdmin, upload.single('file'), uploadAsset);
assetRouter.get('/:id', authenticateAdmin, getAsset);

// ===========================================
// Report Routes
// ===========================================
export const reportRouter = Router();
// Provide centralized reporting endpoint (Campaign Report)
reportRouter.get('/campaign/:id', authenticateAdmin, requirePermission(PERMISSIONS.AUDIT_READ), getCampaignReport);
// Provider Health
reportRouter.get('/provider-health', authenticateAdmin, requirePermission(PERMISSIONS.STATS_READ), getProviderHealth);

// ===========================================
// Stats Routes (Admin Portal - all roles can view)
// ===========================================
export const statsRouter = Router();
statsRouter.get('/dashboard', authenticateAdmin, requireMarketing, getDashboardStats);
statsRouter.get('/apps', authenticateAdmin, requireMarketing, getAppStats);
statsRouter.get('/trend', authenticateAdmin, requireMarketing, getNotificationTrend);
statsRouter.get('/providers', authenticateAdmin, requireMarketing, getProviderStats);

// ===========================================
// Audit Log Routes (Super Admin Only)
// ===========================================
export const auditRouter = Router();
auditRouter.get('/', authenticateAdmin, requireSuperAdmin, async (req, res, next) => {
    try {
        const { appId, action, adminUserId, startDate, endDate, limit, offset } = req.query;

        const logs = await getAuditLogs({
            appId: appId as string,
            action: action as any,
            adminUserId: adminUserId as string,
            startDate: startDate ? new Date(startDate as string) : undefined,
            endDate: endDate ? new Date(endDate as string) : undefined,
            limit: limit ? parseInt(limit as string) : 50,
            offset: offset ? parseInt(offset as string) : 0,
        });

        res.json({ success: true, data: logs });
    } catch (error) {
        next(error);
    }
});

// ===========================================
// Organization Routes (New RBAC)
// ===========================================
export const orgRouter = Router();

// Organization management
orgRouter.post('/', authenticateAdmin, requirePermission(PERMISSIONS.ORG_CREATE), createOrg);
orgRouter.get('/', authenticateAdmin, getOrgs);

// Role management within organization
orgRouter.post('/:orgId/roles', authenticateAdmin, requirePermission(PERMISSIONS.ORG_UPDATE), createRole);
orgRouter.get('/:orgId/roles', authenticateAdmin, getRoles);
orgRouter.put('/:orgId/roles/:roleId', authenticateAdmin, requirePermission(PERMISSIONS.ORG_UPDATE), updateRole);

// Member management within organization
orgRouter.post('/:orgId/members', authenticateAdmin, requirePermission(PERMISSIONS.ORG_UPDATE), addMember);
orgRouter.put('/:orgId/members/:memberId', authenticateAdmin, requirePermission(PERMISSIONS.ORG_UPDATE), updateMember);

// List all available permissions
orgRouter.get('/permissions', authenticateAdmin, listPermissions);
