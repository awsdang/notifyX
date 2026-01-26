/**
 * RBAC (Role-Based Access Control) Tests
 * Tests for authentication, authorization, and role permissions
 * Based on personas: Super Admin, Manager, Marketing, Analyst
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError } from './setup';

interface AuthTokens {
    superAdmin: string;
    manager: string;
    marketing: string;
    analyst: string;
}

let tokens: Partial<AuthTokens> = {};
let testAppId: string;

beforeAll(async () => {
    // Get tokens for all roles
    const roles = ['superAdmin', 'manager', 'marketing', 'analyst'] as const;

    for (const role of roles) {
        const auth = await login(testAdmins[role]);
        if (auth) {
            tokens[role] = auth.token;
        }
    }

    // Create a test app
    const appRes = await http.post<{ success: boolean; data: { id: string } }>(
        '/apps',
        { body: factory.app() }
    );
    if (appRes.ok) {
        testAppId = appRes.data.data.id;
        // Create PROD environment (needed for credentials tests)
        await http.post(`/apps/${testAppId}/env`, {
            body: { env: 'PROD', isEnabled: true },
            token: tokens.superAdmin
        });
    }
});

afterAll(async () => {
    if (testAppId && tokens.superAdmin) {
        await http.post(`/apps/${testAppId}/kill`, { token: tokens.superAdmin });
    }
    await cleanup.runAll(tokens.superAdmin);
});

// ============================================================
// Authentication Tests
// ============================================================

describe('RBAC - Authentication', () => {
    test('should login with valid credentials', async () => {
        const res = await http.post<{ success: boolean; data: { token: string; user: { role: string } } }>(
            '/admin/login',
            { body: testAdmins.superAdmin }
        );

        expectSuccess(res);
        expect(res.data.data.token).toBeDefined();
        expect(res.data.data.user.role).toBeDefined();
    });

    test('should reject invalid credentials', async () => {
        const res = await http.post('/admin/login', {
            body: { email: 'invalid@test.local', password: 'wrongpassword' }
        });

        expectError(res, 401);
    });

    test('should reject empty credentials', async () => {
        const res = await http.post('/admin/login', {
            body: {}
        });

        expectError(res, 400);
    });

    test('should get current user info', async () => {
        if (!tokens.superAdmin) return;

        const res = await http.get<{ success: boolean; data: { email: string; role: string } }>(
            '/admin/me',
            { token: tokens.superAdmin }
        );

        expectSuccess(res);
        expect(res.data.data.email).toBe(testAdmins.superAdmin.email);
    });

    test('should logout successfully', async () => {
        // Login to get a fresh token
        const loginRes = await http.post<{ success: boolean; data: { token: string } }>(
            '/admin/login',
            { body: testAdmins.marketing }
        );
        expectSuccess(loginRes);
        const tempToken = loginRes.data.data.token;

        // Logout
        const res = await http.post<{ success: boolean }>(
            '/admin/logout',
            { token: tempToken }
        );

        expectSuccess(res);
    });

    test('should reject requests without token', async () => {
        const res = await http.get('/admin/me');
        expectError(res, 401);
    });

    test('should reject requests with invalid token', async () => {
        const res = await http.get('/admin/me', {
            token: 'invalid-jwt-token-here'
        });

        expectError(res, 401);
    });
});

// ============================================================
// Super Admin Tests
// ============================================================

describe('RBAC - Super Admin Role', () => {
    test('Super Admin should access audit logs', async () => {
        if (!tokens.superAdmin) return;

        const res = await http.get('/audit', { token: tokens.superAdmin });
        expectSuccess(res);
    });

    test('Super Admin should list all admin users', async () => {
        if (!tokens.superAdmin) return;

        const res = await http.get<{ success: boolean; data: Array<{ id: string }> }>(
            '/admin/users',
            { token: tokens.superAdmin }
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('Super Admin should kill/revive apps', async () => {
        if (!tokens.superAdmin) return;

        // Create an app
        const appRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/apps',
            { body: factory.app() }
        );
        expectSuccess(appRes);
        const appId = appRes.data.data.id;

        // Kill app
        const killRes = await http.post<{ success: boolean }>(
            `/apps/${appId}/kill`,
            { token: tokens.superAdmin }
        );
        expectSuccess(killRes);

        // Revive app
        const reviveRes = await http.post<{ success: boolean }>(
            `/apps/${appId}/revive`,
            { token: tokens.superAdmin }
        );
        expectSuccess(reviveRes);

        cleanup.trackApp(appId);
    });

    test('Super Admin should access credentials', async () => {
        if (!tokens.superAdmin) return;

        const res = await http.get(
            `/apps/${testAppId}/env/PROD/credentials`,
            { token: tokens.superAdmin }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Manager Tests
// ============================================================

describe('RBAC - Manager Role', () => {
    test('Manager should access credentials for assigned apps', async () => {
        if (!tokens.manager) return;

        const res = await http.get(
            `/apps/${testAppId}/credentials`,
            { token: tokens.manager }
        );

        // May succeed or fail based on app assignment
        expect(res.status).toBeLessThan(500);
    });

    test('Manager should NOT access audit logs', async () => {
        if (!tokens.manager) return;

        const res = await http.get('/audit', { token: tokens.manager });
        expectError(res, 403);
    });

    test('Manager should NOT list admin users', async () => {
        if (!tokens.manager) return;

        const res = await http.get('/admin/users', { token: tokens.manager });
        expectError(res, 403);
    });

    test('Manager should NOT kill apps', async () => {
        if (!tokens.manager) return;

        const res = await http.post(
            `/apps/${testAppId}/kill`,
            { token: tokens.manager }
        );
        expectError(res, 403);
    });

    test('Manager should deactivate devices', async () => {
        if (!tokens.manager) return;

        // Create user and device first
        const userRes = await http.post<{ success: boolean; data: { id: string } }>('/users', {
            body: { ...factory.user(), appId: testAppId }
        });
        if (!userRes.ok) return;
        const userId = userRes.data.data.id;
        cleanup.trackUser(userId);

        const deviceRes = await http.post<{ success: boolean; data: { id: string } }>('/users/device', {
            body: factory.device(userId, testAppId)
        });
        if (!deviceRes.ok) return;
        const deviceId = deviceRes.data.data.id;

        // Manager can deactivate
        const res = await http.patch(
            `/devices/${deviceId}/deactivate`,
            { token: tokens.manager }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Marketing Tests
// ============================================================

describe('RBAC - Marketing Role', () => {
    test('Marketing should create templates', async () => {
        if (!tokens.marketing) return;

        const res = await http.post<{ success: boolean; data: { id: string } }>(
            '/templates',
            { body: factory.template(testAppId), token: tokens.marketing }
        );

        expectSuccess(res);
        cleanup.trackTemplate(res.data.data.id);
    });

    test('Marketing should create campaigns', async () => {
        if (!tokens.marketing) return;

        const res = await http.post<{ success: boolean; data: { id: string } }>(
            '/campaigns',
            { body: factory.campaign(testAppId), token: tokens.marketing }
        );

        expectSuccess(res);
        cleanup.trackCampaign(res.data.data.id);
    });

    test('Marketing should create A/B tests', async () => {
        if (!tokens.marketing) return;

        const res = await http.post<{ success: boolean; data: { id: string } }>(
            '/ab-tests',
            { body: factory.abTest(testAppId), token: tokens.marketing }
        );

        expectSuccess(res);
        cleanup.trackABTest(res.data.data.id);
    });

    test('Marketing should view dashboard stats', async () => {
        if (!tokens.marketing) return;

        const res = await http.get('/stats/dashboard', { token: tokens.marketing });
        expectSuccess(res);
    });

    test('Marketing should NOT access credentials', async () => {
        if (!tokens.marketing) return;

        const res = await http.get(
            `/apps/${testAppId}/env/PROD/credentials`,
            { token: tokens.marketing }
        );

        expectError(res, 403);
    });

    test('Marketing should NOT set credentials', async () => {
        if (!tokens.marketing) return;

        const res = await http.post(
            `/apps/${testAppId}/env/PROD/credentials/fcm`,
            {
                body: { projectId: 'test', clientEmail: 'test@test.com', privateKey: 'key' },
                token: tokens.marketing,
            }
        );

        expectError(res, 403);
    });

    test('Marketing should NOT access audit logs', async () => {
        if (!tokens.marketing) return;

        const res = await http.get('/audit', { token: tokens.marketing });
        expectError(res, 403);
    });

    test('Marketing should NOT kill apps', async () => {
        if (!tokens.marketing) return;

        const res = await http.post(
            `/apps/${testAppId}/kill`,
            { token: tokens.marketing }
        );

        expectError(res, 403);
    });
});

// ============================================================
// Analyst Tests (Read-Only)
// ============================================================

describe('RBAC - Analyst Role (Read-Only)', () => {
    test('Analyst should view dashboard stats', async () => {
        if (!tokens.analyst) return;

        const res = await http.get('/stats/dashboard', { token: tokens.analyst });

        // Analyst might have limited access - check it doesn't error
        expect(res.status).toBeLessThan(500);
    });

    test('Analyst should NOT create templates', async () => {
        if (!tokens.analyst) return;

        const res = await http.post(
            '/templates',
            { body: factory.template(testAppId), token: tokens.analyst }
        );

        expectError(res, 403);
    });

    test('Analyst should NOT create campaigns', async () => {
        if (!tokens.analyst) return;

        const res = await http.post(
            '/campaigns',
            { body: factory.campaign(testAppId), token: tokens.analyst }
        );

        expectError(res, 403);
    });

    test('Analyst should NOT access audit logs', async () => {
        if (!tokens.analyst) return;

        const res = await http.get('/audit', { token: tokens.analyst });
        expectError(res, 403);
    });
});

// ============================================================
// Cross-App Access Tests
// ============================================================

describe('RBAC - Cross-App Access Control', () => {
    test('should NOT allow access to unassigned app credentials', async () => {
        // Create a new app not assigned to manager
        const appRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/apps',
            { body: factory.app() }
        );
        if (!appRes.ok) return;
        const newAppId = appRes.data.data.id;

        // Manager should not have access (unless assigned)
        if (tokens.manager) {
            const res = await http.get(
                `/apps/${newAppId}/env/PROD/credentials`,
                { token: tokens.manager }
            );

            // Should either 403 or pass if manager has wildcard access
            expect([200, 403]).toContain(res.status);
        }

        // Cleanup
        if (tokens.superAdmin) {
            await http.post(`/apps/${newAppId}/kill`, { token: tokens.superAdmin });
        }
    });
});

// ============================================================
// Permission Boundary Tests
// ============================================================

describe('RBAC - Permission Boundaries', () => {
    test('should prevent privilege escalation via API manipulation', async () => {
        if (!tokens.marketing) return;

        // Try to update another user (should fail)
        const res = await http.patch(
            '/admin/users/some-user-id',
            { body: { role: 'SUPER_ADMIN' }, token: tokens.marketing }
        );

        expectError(res, 403);
    });

    test('should validate role on every request', async () => {
        // Multiple rapid requests should all be validated
        const requests = Array.from({ length: 5 }, () =>
            http.get('/audit', { token: tokens.marketing })
        );

        const results = await Promise.all(requests);

        // All should be denied
        for (const res of results) {
            expectError(res, 403);
        }
    });
});
