/**
 * HMS (Huawei Mobile Services) Provider Tests
 * 
 * ⚠️ REQUIRES PROVIDER CREDENTIALS - SKIPPED BY DEFAULT
 * 
 * Run with: bun test tests/providers
 * 
 * These tests require:
 * - Valid HMS credentials (App ID and App Secret)
 * - A real Huawei device token for testing
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError, batchedRequests } from '../setup';

// Skip all tests if no HMS credentials are available
const HMS_CREDENTIALS_AVAILABLE = Boolean(process.env.HMS_APP_ID && process.env.HMS_APP_SECRET);

let adminToken: string;
let testAppId: string;

beforeAll(async () => {
    if (!HMS_CREDENTIALS_AVAILABLE) {
        console.log('⚠️  HMS credentials not available. Skipping provider tests.');
        return;
    }

    const auth = await login(testAdmins.manager);
    if (auth) {
        adminToken = auth.token;
    }

    // Create a test app
    const appRes = await http.post<{ success: boolean; data: { id: string } }>(
        '/apps',
        { body: factory.app({ platforms: { huawei: true } }) }
    );
    if (appRes.ok) {
        testAppId = appRes.data.data.id;
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
// HMS Credential Configuration Tests
// ============================================================

describe('HMS Provider - Credential Configuration', () => {
    const skipIfNoCredentials = () => {
        if (!HMS_CREDENTIALS_AVAILABLE) {
            console.log('Skipping: HMS credentials not configured');
            return true;
        }
        return false;
    };

    test('should set HMS credentials', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.post<{ success: boolean; data: { provider: string; isActive: boolean } }>(
            `/apps/${testAppId}/credentials`,
            {
                body: {
                    provider: 'hms',
                    appId: process.env.HMS_APP_ID,
                    appSecret: process.env.HMS_APP_SECRET,
                },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.provider).toBe('hms');
        expect(res.data.data.isActive).toBe(true);
    });

    test('should get HMS credentials (without secrets)', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.get<{ success: boolean; data: Array<{ provider: string }> }>(
            `/apps/${testAppId}/credentials`,
            { token: adminToken }
        );

        expectSuccess(res);
        const hms = res.data.data.find(c => c.provider === 'hms');
        expect(hms).toBeDefined();
    });

    test('should test HMS credentials', async () => {
        if (skipIfNoCredentials()) return;

        const testToken = process.env.HMS_TEST_TOKEN;
        if (!testToken) {
            console.log('Skipping: No HMS_TEST_TOKEN provided');
            return;
        }

        const res = await http.post<{ success: boolean; data: { success: boolean } }>(
            `/apps/${testAppId}/credentials/hms/test`,
            {
                body: { testToken },
                token: adminToken,
            }
        );

        expect(res.status).toBeLessThan(500);
    });

    test('should toggle HMS credential active status', async () => {
        if (skipIfNoCredentials()) return;

        // Disable
        const disableRes = await http.patch<{ success: boolean; data: { isActive: boolean } }>(
            `/apps/${testAppId}/credentials/hms`,
            {
                body: { isActive: false },
                token: adminToken,
            }
        );
        expectSuccess(disableRes);
        expect(disableRes.data.data.isActive).toBe(false);

        // Re-enable
        const enableRes = await http.patch<{ success: boolean; data: { isActive: boolean } }>(
            `/apps/${testAppId}/credentials/hms`,
            {
                body: { isActive: true },
                token: adminToken,
            }
        );
        expectSuccess(enableRes);
        expect(enableRes.data.data.isActive).toBe(true);
    });

    test('should delete HMS credentials', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.delete<{ success: boolean }>(
            `/apps/${testAppId}/credentials/hms`,
            { token: adminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// HMS Notification Tests
// ============================================================

describe('HMS Provider - Notification Delivery', () => {
    const skipIfNoCredentials = () => {
        if (!HMS_CREDENTIALS_AVAILABLE) {
            console.log('Skipping: HMS credentials not configured');
            return true;
        }
        return false;
    };

    test('should send single notification to Huawei device', async () => {
        if (skipIfNoCredentials()) return;

        const testToken = process.env.HMS_TEST_TOKEN;
        if (!testToken) return;

        // Ensure credentials are set
        await http.post(`/apps/${testAppId}/credentials`, {
            body: {
                provider: 'hms',
                appId: process.env.HMS_APP_ID,
                appSecret: process.env.HMS_APP_SECRET,
            },
            token: adminToken,
        });

        // Create user with Huawei device
        const userRes = await http.post<{ success: boolean; data: { id: string } }>('/users', {
            body: { ...factory.user(), appId: testAppId }
        });
        if (!userRes.ok) return;
        const userId = userRes.data.data.id;
        cleanup.trackUser(userId);

        await http.post('/users/device', {
            body: {
                userId,
                appId: testAppId,
                platform: 'huawei',
                token: testToken,
            }
        });

        // Send notification
        const res = await http.post<{ success: boolean }>('/notifications', {
            body: factory.notification(testAppId, {
                title: 'HMS Test',
                body: 'Testing Huawei push notification',
                userIds: [userId],
            })
        });

        expectSuccess(res);
    });

    test('should send bulk notifications to multiple Huawei devices', async () => {
        if (skipIfNoCredentials()) return;

        const testTokens = process.env.HMS_TEST_TOKENS?.split(',') || [];
        if (testTokens.length < 2) {
            console.log('Skipping: Need multiple HMS_TEST_TOKENS for bulk test');
            return;
        }

        const userIds: string[] = [];
        for (const token of testTokens) {
            const userRes = await http.post<{ success: boolean; data: { id: string } }>('/users', {
                body: { ...factory.user(), appId: testAppId }
            });
            if (!userRes.ok) continue;
            const userId = userRes.data.data.id;
            userIds.push(userId);
            cleanup.trackUser(userId);

            await http.post('/users/device', {
                body: { userId, appId: testAppId, platform: 'huawei', token }
            });
        }

        const res = await http.post<{ success: boolean }>('/notifications', {
            body: factory.notification(testAppId, {
                title: 'HMS Bulk Test',
                body: 'Testing bulk Huawei push',
                userIds,
            })
        });

        expectSuccess(res);
    });
});

// ============================================================
// Skip Notice
// ============================================================

describe('HMS Provider - Availability Check', () => {
    test('should report HMS credential availability', () => {
        if (HMS_CREDENTIALS_AVAILABLE) {
            console.log('✅ HMS credentials are configured');
        } else {
            console.log('⚠️  HMS credentials not configured.');
            console.log('   Set the following environment variables to run HMS tests:');
            console.log('   - HMS_APP_ID');
            console.log('   - HMS_APP_SECRET');
            console.log('   - HMS_TEST_TOKEN (for delivery tests)');
        }
        expect(true).toBe(true);
    });
});
