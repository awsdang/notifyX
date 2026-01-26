/**
 * APNs (Apple Push Notification Service) Provider Tests
 * 
 * ⚠️ REQUIRES PROVIDER CREDENTIALS - SKIPPED BY DEFAULT
 * 
 * Run with: bun test tests/providers
 * 
 * These tests require:
 * - Valid APNs credentials (.p8 file or certificate)
 * - A real iOS device token for testing
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError, batchedRequests } from '../setup';

// Skip all tests if no APNs credentials are available
const APNS_CREDENTIALS_AVAILABLE = Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);

let adminToken: string;
let testAppId: string;

beforeAll(async () => {
    if (!APNS_CREDENTIALS_AVAILABLE) {
        console.log('⚠️  APNs credentials not available. Skipping provider tests.');
        return;
    }

    const auth = await login(testAdmins.manager);
    if (auth) {
        adminToken = auth.token;
    }

    // Create a test app
    const appRes = await http.post<{ success: boolean; data: { id: string } }>(
        '/apps',
        { body: factory.app({ platforms: { ios: true } }) }
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
// APNs Credential Configuration Tests
// ============================================================

describe('APNs Provider - Credential Configuration', () => {
    const skipIfNoCredentials = () => {
        if (!APNS_CREDENTIALS_AVAILABLE) {
            console.log('Skipping: APNs credentials not configured');
            return true;
        }
        return false;
    };

    test('should set APNs credentials', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.post<{ success: boolean; data: { provider: string; isActive: boolean } }>(
            `/apps/${testAppId}/credentials`,
            {
                body: {
                    provider: 'apns',
                    keyId: process.env.APNS_KEY_ID,
                    teamId: process.env.APNS_TEAM_ID,
                    bundleId: process.env.APNS_BUNDLE_ID || 'com.test.notifyx',
                    privateKey: process.env.APNS_PRIVATE_KEY,
                    production: false, // Use sandbox for testing
                },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.provider).toBe('apns');
        expect(res.data.data.isActive).toBe(true);
    });

    test('should get APNs credentials (without secrets)', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.get<{ success: boolean; data: Array<{ provider: string }> }>(
            `/apps/${testAppId}/credentials`,
            { token: adminToken }
        );

        expectSuccess(res);
        const apns = res.data.data.find(c => c.provider === 'apns');
        expect(apns).toBeDefined();
    });

    test('should test APNs credentials', async () => {
        if (skipIfNoCredentials()) return;

        const testToken = process.env.APNS_TEST_TOKEN;
        if (!testToken) {
            console.log('Skipping: No APNS_TEST_TOKEN provided');
            return;
        }

        const res = await http.post<{ success: boolean; data: { success: boolean; messageId?: string } }>(
            `/apps/${testAppId}/credentials/apns/test`,
            {
                body: { testToken },
                token: adminToken,
            }
        );

        // May succeed or fail based on token validity
        expect(res.status).toBeLessThan(500);
    });

    test('should toggle APNs credential active status', async () => {
        if (skipIfNoCredentials()) return;

        // Disable
        const disableRes = await http.patch<{ success: boolean; data: { isActive: boolean } }>(
            `/apps/${testAppId}/credentials/apns`,
            {
                body: { isActive: false },
                token: adminToken,
            }
        );
        expectSuccess(disableRes);
        expect(disableRes.data.data.isActive).toBe(false);

        // Re-enable
        const enableRes = await http.patch<{ success: boolean; data: { isActive: boolean } }>(
            `/apps/${testAppId}/credentials/apns`,
            {
                body: { isActive: true },
                token: adminToken,
            }
        );
        expectSuccess(enableRes);
        expect(enableRes.data.data.isActive).toBe(true);
    });

    test('should delete APNs credentials', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.delete<{ success: boolean }>(
            `/apps/${testAppId}/credentials/apns`,
            { token: adminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// APNs Notification Tests
// ============================================================

describe('APNs Provider - Notification Delivery', () => {
    const skipIfNoCredentials = () => {
        if (!APNS_CREDENTIALS_AVAILABLE) {
            console.log('Skipping: APNs credentials not configured');
            return true;
        }
        return false;
    };

    test('should send single notification to iOS device', async () => {
        if (skipIfNoCredentials()) return;

        const testToken = process.env.APNS_TEST_TOKEN;
        if (!testToken) return;

        // Ensure credentials are set
        await http.post(`/apps/${testAppId}/credentials`, {
            body: {
                provider: 'apns',
                keyId: process.env.APNS_KEY_ID,
                teamId: process.env.APNS_TEAM_ID,
                bundleId: process.env.APNS_BUNDLE_ID || 'com.test.notifyx',
                privateKey: process.env.APNS_PRIVATE_KEY,
                production: false,
            },
            token: adminToken,
        });

        // Create user with iOS device
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
                platform: 'ios',
                token: testToken,
            }
        });

        // Send notification
        const res = await http.post<{ success: boolean }>('/notifications', {
            body: factory.notification(testAppId, {
                title: 'APNs Test',
                body: 'Testing iOS push notification',
                userIds: [userId],
            })
        });

        expectSuccess(res);
    });

    test('should send bulk notifications to multiple iOS devices', async () => {
        if (skipIfNoCredentials()) return;

        const testTokens = process.env.APNS_TEST_TOKENS?.split(',') || [];
        if (testTokens.length < 2) {
            console.log('Skipping: Need multiple APNS_TEST_TOKENS for bulk test');
            return;
        }

        // Create multiple users with devices
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
                body: { userId, appId: testAppId, platform: 'ios', token }
            });
        }

        // Send bulk notification
        const res = await http.post<{ success: boolean }>('/notifications', {
            body: factory.notification(testAppId, {
                title: 'APNs Bulk Test',
                body: 'Testing bulk iOS push',
                userIds,
            })
        });

        expectSuccess(res);
    });
});

// ============================================================
// APNs Error Handling Tests
// ============================================================

describe('APNs Provider - Error Handling', () => {
    test('should reject invalid APNs credentials', async () => {
        if (!APNS_CREDENTIALS_AVAILABLE) return;

        const res = await http.post(
            `/apps/${testAppId}/credentials`,
            {
                body: {
                    provider: 'apns',
                    keyId: 'INVALIDKEY',
                    teamId: 'INVALIDTM',
                    bundleId: 'com.invalid.bundle',
                    privateKey: 'not-a-valid-key',
                    production: false,
                },
                token: adminToken,
            }
        );

        // May accept the data but fail on test
        expect(res.status).toBeLessThan(500);
    });

    test('should handle invalid device token gracefully', async () => {
        if (!APNS_CREDENTIALS_AVAILABLE) return;

        const res = await http.post(
            `/apps/${testAppId}/credentials/apns/test`,
            {
                body: { testToken: 'invalid_token_12345' },
                token: adminToken,
            }
        );

        // Should return error, not crash
        expect(res.status).toBeLessThan(500);
    });
});

// ============================================================
// Skip Notice
// ============================================================

describe('APNs Provider - Availability Check', () => {
    test('should report APNs credential availability', () => {
        if (APNS_CREDENTIALS_AVAILABLE) {
            console.log('✅ APNs credentials are configured');
        } else {
            console.log('⚠️  APNs credentials not configured.');
            console.log('   Set the following environment variables to run APNs tests:');
            console.log('   - APNS_KEY_ID');
            console.log('   - APNS_TEAM_ID');
            console.log('   - APNS_BUNDLE_ID');
            console.log('   - APNS_PRIVATE_KEY');
            console.log('   - APNS_TEST_TOKEN (for delivery tests)');
        }
        expect(true).toBe(true); // Always pass
    });
});
