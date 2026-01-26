/**
 * Stats & Dashboard API Tests
 * Tests for dashboard statistics, trends, provider stats, and analytics
 * Includes both single and bulk request tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError } from './setup';

let adminToken: string;
let testAppId: string;

beforeAll(async () => {
    const auth = await login(testAdmins.marketing);
    if (auth) {
        adminToken = auth.token;
    }

    // Create a test app and some notifications for stats
    const appRes = await http.post<{ success: boolean; data: { id: string } }>(
        '/apps',
        { body: factory.app() }
    );
    if (appRes.ok) {
        testAppId = appRes.data.data.id;

        // Create some notifications to have data
        for (let i = 0; i < 5; i++) {
            await http.post('/notifications', {
                body: factory.notification(testAppId)
            });
        }
    }
});

afterAll(async () => {
    if (testAppId) {
        const superAuth = await login(testAdmins.superAdmin);
        if (superAuth) {
            await http.post(`/apps/${testAppId}/kill`, { token: superAuth.token });
        }
    }
    await cleanup.runAll(adminToken);
});

// ============================================================
// Dashboard Stats Tests
// ============================================================

describe('Stats API - Dashboard', () => {
    test('should get dashboard stats', async () => {
        const res = await http.get<{
            success: boolean; data: Array<{
                title: string;
                value: string;
                unit: string | null;
            }>
        }>(
            '/stats/dashboard',
            { token: adminToken }
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data)).toBe(true);
        const totalStat = res.data.data.find(s => s.title === 'Total Notifications');
        expect(totalStat).toBeDefined();
        expect(typeof totalStat?.value).toBe('string');
    });

    test('should get dashboard stats with date filter', async () => {
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = new Date().toISOString();

        const res = await http.get<{ success: boolean; data: Array<{ title: string; value: string }> }>(
            `/stats/dashboard?startDate=${startDate}&endDate=${endDate}`,
            { token: adminToken }
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data)).toBe(true);
    });
});

// ============================================================
// App Stats Tests
// ============================================================

describe('Stats API - App Stats', () => {
    test('should get stats per app', async () => {
        const res = await http.get<{
            success: boolean; data: Array<{
                title: string;
                value: string;
            }>
        }>(
            '/stats/apps',
            { token: adminToken }
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('should get stats for specific app', async () => {
        const res = await http.get<{ success: boolean; data: Array<{ title: string }> }>(
            `/stats/apps?appId=${testAppId}`,
            { token: adminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Notification Trend Tests
// ============================================================

describe('Stats API - Trends', () => {
    test('should get notification trend (last 7 days)', async () => {
        const res = await http.get<{
            success: boolean; data: Array<{
                title: string;
                value: string;
            }>
        }>(
            '/stats/trend?days=7',
            { token: adminToken }
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('should get notification trend (last 30 days)', async () => {
        const res = await http.get<{ success: boolean; data: Array<{ title: string }> }>(
            '/stats/trend?days=30',
            { token: adminToken }
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('should get trend filtered by app', async () => {
        const res = await http.get<{ success: boolean; data: Array<{ date: string }> }>(
            `/stats/trend?appId=${testAppId}&days=7`,
            { token: adminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Provider Stats Tests
// ============================================================

describe('Stats API - Provider Stats', () => {
    test('should get stats by provider', async () => {
        const res = await http.get<{
            success: boolean; data: Array<{
                title: string;
                value: string;
            }>
        }>(
            '/stats/providers',
            { token: adminToken }
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('should get provider stats filtered by date', async () => {
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const res = await http.get<{ success: boolean; data: Array<{ provider: string }> }>(
            `/stats/providers?startDate=${startDate}`,
            { token: adminToken }
        );

        expectSuccess(res);
    });

    test('should get provider stats filtered by app', async () => {
        const res = await http.get<{ success: boolean; data: Array<{ provider: string }> }>(
            `/stats/providers?appId=${testAppId}`,
            { token: adminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Analyst Workflow (from docs)
// ============================================================

describe('Stats API - Analyst Workflow', () => {
    test('should complete weekly performance review workflow', async () => {
        // 1. Get dashboard overview
        const dashboardRes = await http.get<{ success: boolean; data: { totalNotifications: number } }>(
            '/stats/dashboard',
            { token: adminToken }
        );
        expectSuccess(dashboardRes);

        // 2. Get 7-day trend
        const trendRes = await http.get<{ success: boolean; data: Array<{ date: string }> }>(
            '/stats/trend?days=7',
            { token: adminToken }
        );
        expectSuccess(trendRes);

        // 3. Break down by provider
        const providerRes = await http.get<{ success: boolean; data: Array<{ provider: string }> }>(
            '/stats/providers',
            { token: adminToken }
        );
        expectSuccess(providerRes);

        // 4. Break down by app
        const appRes = await http.get<{ success: boolean; data: Array<{ appId: string }> }>(
            '/stats/apps',
            { token: adminToken }
        );
        expectSuccess(appRes);

        // All queries should succeed for analyst workflow
        console.log('Analyst weekly review workflow completed successfully');
    });
});

// ============================================================
// Edge Cases
// ============================================================

describe('Stats API - Edge Cases', () => {
    test('should handle empty date range', async () => {
        // Future date range with no data
        const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        const res = await http.get<{ success: boolean; data: Array<unknown> }>(
            `/stats/trend?startDate=${futureDate}`,
            { token: adminToken }
        );

        // Should succeed but return empty or zero data
        expect(res.status).toBeLessThan(500);
    });

    test('should handle invalid date format gracefully', async () => {
        const res = await http.get(
            '/stats/trend?startDate=invalid-date',
            { token: adminToken }
        );

        // Should either return 400 or handle gracefully
        expect(res.status).toBeLessThan(500);
    });
});
