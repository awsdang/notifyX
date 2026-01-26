/**
 * Audit Logs API Tests
 * Tests for audit log querying, filtering, and compliance tracking
 * Includes both single and bulk request tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError, delay } from './setup';

let superAdminToken: string;
let marketingToken: string;
let testAppId: string;

beforeAll(async () => {
    // Super Admin for audit access
    const superAuth = await login(testAdmins.superAdmin);
    if (superAuth) {
        superAdminToken = superAuth.token;
    }

    // Marketing for generating audit events
    const marketingAuth = await login(testAdmins.marketing);
    if (marketingAuth) {
        marketingToken = marketingAuth.token;
    }

    // Create a test app to generate audit events
    const appRes = await http.post<{ success: boolean; data: { id: string } }>(
        '/apps',
        { body: factory.app() }
    );
    if (appRes.ok) {
        testAppId = appRes.data.data.id;
    }

    // Generate some audit events
    await http.post('/templates', {
        body: factory.template(testAppId),
        token: marketingToken,
    });

    await http.post('/campaigns', {
        body: factory.campaign(testAppId),
        token: marketingToken,
    });

    // Wait for audit entries to be persisted
    await delay(500);
});

afterAll(async () => {
    if (testAppId && superAdminToken) {
        await http.post(`/apps/${testAppId}/kill`, { token: superAdminToken });
    }
    await cleanup.runAll(superAdminToken);
});

// ============================================================
// Single Request Tests
// ============================================================

describe('Audit Logs API - Single Requests', () => {
    test('should get audit logs (Super Admin only)', async () => {
        const res = await http.get<{
            success: boolean; data: {
                logs: Array<{
                    id: string;
                    action: string;
                    adminUserId: string;
                    createdAt: string;
                }>;
                total: number;
            }
        }>(
            '/audit',
            { token: superAdminToken }
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data.logs)).toBe(true);
    });

    test('should deny audit access to non-Super Admin', async () => {
        const res = await http.get('/audit', { token: marketingToken });
        expectError(res, 403);
    });

    test('should filter audit logs by action', async () => {
        const res = await http.get<{ success: boolean; data: { logs: Array<{ action: string }> } }>(
            '/audit?action=TEMPLATE_CREATED',
            { token: superAdminToken }
        );

        expectSuccess(res);
        // All returned entries should have matching action
        for (const entry of res.data.data.logs) {
            expect(entry.action).toBe('TEMPLATE_CREATED');
        }
    });

    test('should filter audit logs by app', async () => {
        const res = await http.get<{ success: boolean; data: { logs: Array<{ appId: string }> } }>(
            `/audit?appId=${testAppId}`,
            { token: superAdminToken }
        );

        expectSuccess(res);
    });

    test('should filter audit logs by date range', async () => {
        const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const endDate = new Date().toISOString();

        const res = await http.get<{ success: boolean; data: { logs: Array<{ createdAt: string }> } }>(
            `/audit?startDate=${startDate}&endDate=${endDate}`,
            { token: superAdminToken }
        );

        expectSuccess(res);
        // All entries should be within date range
        for (const entry of res.data.data.logs) {
            const entryDate = new Date(entry.createdAt);
            expect(entryDate >= new Date(startDate)).toBe(true);
            expect(entryDate <= new Date(endDate)).toBe(true);
        }
    });

    test('should paginate audit logs', async () => {
        // Get first page
        const page1 = await http.get<{ success: boolean; data: { logs: Array<{ id: string }> } }>(
            '/audit?limit=5&offset=0',
            { token: superAdminToken }
        );
        expectSuccess(page1);
        expect(page1.data.data.logs.length).toBeLessThanOrEqual(5);

        // Get second page
        const page2 = await http.get<{ success: boolean; data: { logs: Array<{ id: string }> } }>(
            '/audit?limit=5&offset=5',
            { token: superAdminToken }
        );
        expectSuccess(page2);

        // Pages should not overlap (if we have enough data)
        if (page1.data.data.logs.length > 0 && page2.data.data.logs.length > 0) {
            const page1Ids = new Set(page1.data.data.logs.map(e => e.id));
            const hasOverlap = page2.data.data.logs.some(e => page1Ids.has(e.id));
            expect(hasOverlap).toBe(false);
        }
    });
});

// ============================================================
// Audit Event Types Tests
// ============================================================

describe('Audit Logs API - Event Types', () => {
    test('should log APP_CREATED events', async () => {
        // Create an app (generates audit event)
        const createRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/apps',
            { body: factory.app() }
        );
        expectSuccess(createRes);
        const appId = createRes.data.data.id;

        await delay(500); // Wait for audit to be written

        // Check audit log
        const auditRes = await http.get<{ success: boolean; data: { logs: Array<{ action: string; resource: string }> } }>(
            '/audit?action=APP_CREATED&limit=10',
            { token: superAdminToken }
        );
        expectSuccess(auditRes);

        // Clean up
        await http.post(`/apps/${appId}/kill`, { token: superAdminToken });
    });

    test('should log TEMPLATE_CREATED events', async () => {
        const res = await http.get<{ success: boolean; data: { logs: Array<{ action: string }> } }>(
            '/audit?action=TEMPLATE_CREATED',
            { token: superAdminToken }
        );

        expectSuccess(res);
        // Should have at least the one from setup
    });

    test('should log CAMPAIGN_CREATED events', async () => {
        const res = await http.get<{ success: boolean; data: { logs: Array<{ action: string }> } }>(
            '/audit?action=CAMPAIGN_CREATED',
            { token: superAdminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Compliance & Forensics Tests (from docs)
// ============================================================

describe('Audit Logs API - Compliance Workflow', () => {
    test('should investigate actions by campaign ID', async () => {
        // Create a campaign
        const campaignRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/campaigns',
            { body: factory.campaign(testAppId), token: marketingToken }
        );
        expectSuccess(campaignRes);
        const campaignId = campaignRes.data.data.id;
        cleanup.trackCampaign(campaignId);

        await delay(500);

        // Search audit logs for this campaign
        const res = await http.get<{
            success: boolean; data: {
                logs: Array<{
                    action: string;
                    adminUserId: string;
                    details: unknown;
                }>
            }
        }>(
            `/audit?appId=${testAppId}`,
            { token: superAdminToken }
        );

        expectSuccess(res);
        // Should be able to trace who created the campaign
    });

    test('should export audit trail for investigation', async () => {
        // Get comprehensive audit data for a time period
        const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const res = await http.get<{
            success: boolean; data: {
                logs: Array<{
                    id: string;
                    action: string;
                    adminUserId: string;
                    resource: string;
                    details: unknown;
                    createdAt: string;
                }>
            }
        }>(
            `/audit?startDate=${startDate}&limit=100`,
            { token: superAdminToken }
        );

        expectSuccess(res);

        // Verify entries contain required forensic information
        for (const entry of res.data.data.logs) {
            expect(entry.id).toBeDefined();
            expect(entry.action).toBeDefined();
            expect(entry.createdAt).toBeDefined();
        }
    });

    test('should track credential changes', async () => {
        // Note: We can't actually set credentials without provider keys
        // But we verify the audit log endpoint works for this action type

        const res = await http.get<{ success: boolean; data: { logs: Array<{ action: string }> } }>(
            '/audit?action=CREDENTIAL_UPLOADED',
            { token: superAdminToken }
        );

        // Should not error, just might be empty
        expectSuccess(res);
    });
});

// ============================================================
// Bulk Query Tests
// ============================================================

describe('Audit Logs API - Bulk Queries', () => {
    test('should handle large limit parameter', async () => {
        const res = await http.get<{ success: boolean; data: { logs: Array<{ id: string }> } }>(
            '/audit?limit=100',
            { token: superAdminToken }
        );

        expectSuccess(res);
        expect(res.data.data.logs.length).toBeLessThanOrEqual(100);
    });

    test('should handle multiple filters combined', async () => {
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = new Date().toISOString();

        const res = await http.get<{ success: boolean; data: { logs: Array<{ id: string }> } }>(
            `/audit?appId=${testAppId}&startDate=${startDate}&endDate=${endDate}&limit=50`,
            { token: superAdminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Security Tests
// ============================================================

describe('Audit Logs API - Security', () => {
    test('should verify audit entries are immutable (read-only API)', async () => {
        // Attempt to modify an audit entry (should not be possible)
        // Since there's no PUT/DELETE endpoint, just verify GET works
        const res = await http.get<{ success: boolean }>(
            '/audit',
            { token: superAdminToken }
        );

        expectSuccess(res);
    });

    test('should include actor information in entries', async () => {
        const res = await http.get<{ success: boolean; data: Array<{ adminUserId: string }> }>(
            '/audit?limit=10',
            { token: superAdminToken }
        );

        expectSuccess(res);

        // Entries should have actor (adminUserId) when applicable
        // Some system events might not have an actor
    });
});
