/**
 * FCM (Firebase Cloud Messaging) Provider Tests
 * 
 * ⚠️ REQUIRES PROVIDER CREDENTIALS - SKIPPED BY DEFAULT
 * 
 * Run with: bun test tests/providers
 * 
 * These tests require:
 * - Valid FCM service account JSON credentials
 * - A real Android device token for testing
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError, batchedRequests } from '../setup';

// Skip all tests if no FCM credentials are available
const FCM_CREDENTIALS_AVAILABLE = Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL);

let adminToken: string;
let testAppId: string;

beforeAll(async () => {
    if (!FCM_CREDENTIALS_AVAILABLE) {
        console.log('⚠️  FCM credentials not available. Skipping provider tests.');
        return;
    }

    const auth = await login(testAdmins.manager);
    if (auth) {
        adminToken = auth.token;
    }

    // Create a test app
    const appRes = await http.post<{ success: boolean; data: { id: string } }>(
        '/apps',
        { body: factory.app({ platforms: { android: true } }) }
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
// FCM Credential Configuration Tests
// ============================================================

describe('FCM Provider - Credential Configuration', () => {
    const skipIfNoCredentials = () => {
        if (!FCM_CREDENTIALS_AVAILABLE) {
            console.log('Skipping: FCM credentials not configured');
            return true;
        }
        return false;
    };

    test('should set FCM credentials', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.post<{ success: boolean; data: { provider: string; isActive: boolean } }>(
            `/apps/${testAppId}/credentials`,
            {
                body: {
                    provider: 'fcm',
                    projectId: process.env.FCM_PROJECT_ID,
                    clientEmail: process.env.FCM_CLIENT_EMAIL,
                    privateKey: process.env.FCM_PRIVATE_KEY,
                },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.provider).toBe('fcm');
        expect(res.data.data.isActive).toBe(true);
    });

    test('should get FCM credentials (without secrets)', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.get<{ success: boolean; data: Array<{ provider: string }> }>(
            `/apps/${testAppId}/credentials`,
            { token: adminToken }
        );

        expectSuccess(res);
        const fcm = res.data.data.find(c => c.provider === 'fcm');
        expect(fcm).toBeDefined();
    });

    test('should test FCM credentials', async () => {
        if (skipIfNoCredentials()) return;

        const testToken = process.env.FCM_TEST_TOKEN;
        if (!testToken) {
            console.log('Skipping: No FCM_TEST_TOKEN provided');
            return;
        }

        const res = await http.post<{ success: boolean; data: { success: boolean; messageId?: string } }>(
            `/apps/${testAppId}/credentials/fcm/test`,
            {
                body: { testToken },
                token: adminToken,
            }
        );

        // May succeed or fail based on token validity
        expect(res.status).toBeLessThan(500);
    });

    test('should toggle FCM credential active status', async () => {
        if (skipIfNoCredentials()) return;

        // Disable
        const disableRes = await http.patch<{ success: boolean; data: { isActive: boolean } }>(
            `/apps/${testAppId}/credentials/fcm`,
            {
                body: { isActive: false },
                token: adminToken,
            }
        );
        expectSuccess(disableRes);
        expect(disableRes.data.data.isActive).toBe(false);

        // Re-enable
        const enableRes = await http.patch<{ success: boolean; data: { isActive: boolean } }>(
            `/apps/${testAppId}/credentials/fcm`,
            {
                body: { isActive: true },
                token: adminToken,
            }
        );
        expectSuccess(enableRes);
        expect(enableRes.data.data.isActive).toBe(true);
    });

    test('should delete FCM credentials', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.delete<{ success: boolean }>(
            `/apps/${testAppId}/credentials/fcm`,
            { token: adminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// FCM Notification Tests
// ============================================================

describe('FCM Provider - Notification Delivery', () => {
    const skipIfNoCredentials = () => {
        if (!FCM_CREDENTIALS_AVAILABLE) {
            console.log('Skipping: FCM credentials not configured');
            return true;
        }
        return false;
    };

    test('should send single notification to Android device', async () => {
        if (skipIfNoCredentials()) return;

        const testToken = process.env.FCM_TEST_TOKEN;
        if (!testToken) return;

        // Ensure credentials are set
        await http.post(`/apps/${testAppId}/credentials`, {
            body: {
                provider: 'fcm',
                projectId: process.env.FCM_PROJECT_ID,
                clientEmail: process.env.FCM_CLIENT_EMAIL,
                privateKey: process.env.FCM_PRIVATE_KEY,
            },
            token: adminToken,
        });

        // Create user with Android device
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
                platform: 'android',
                token: testToken,
            }
        });

        // Send notification
        const res = await http.post<{ success: boolean }>('/notifications', {
            body: factory.notification(testAppId, {
                title: 'FCM Test',
                body: 'Testing Android push notification',
                userIds: [userId],
            })
        });

        expectSuccess(res);
    });

    test('should send bulk notifications to multiple Android devices', async () => {
        if (skipIfNoCredentials()) return;

        const testTokens = process.env.FCM_TEST_TOKENS?.split(',') || [];
        if (testTokens.length < 2) {
            console.log('Skipping: Need multiple FCM_TEST_TOKENS for bulk test');
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
                body: { userId, appId: testAppId, platform: 'android', token }
            });
        }

        // Send bulk notification
        const res = await http.post<{ success: boolean }>('/notifications', {
            body: factory.notification(testAppId, {
                title: 'FCM Bulk Test',
                body: 'Testing bulk Android push',
                userIds,
            })
        });

        expectSuccess(res);
    });
});

// ============================================================
// FCM Token Invalidation Tests
// ============================================================

describe('FCM Provider - Token Handling', () => {
    test('should handle unregistered token', async () => {
        if (!FCM_CREDENTIALS_AVAILABLE) return;

        // Test with a known invalid token pattern
        const res = await http.post(
            `/apps/${testAppId}/credentials/fcm/test`,
            {
                body: { testToken: 'invalid_unregistered_token' },
                token: adminToken,
            }
        );

        // Should return error response, not crash
        expect(res.status).toBeLessThan(500);
    });
});

// ============================================================
// Skip Notice
// ============================================================

describe('FCM Provider - Availability Check', () => {
    test('should report FCM credential availability', () => {
        if (FCM_CREDENTIALS_AVAILABLE) {
            console.log('✅ FCM credentials are configured');
        } else {
            console.log('⚠️  FCM credentials not configured.');
            console.log('   Set the following environment variables to run FCM tests:');
            console.log('   - FCM_PROJECT_ID');
            console.log('   - FCM_CLIENT_EMAIL');
            console.log('   - FCM_PRIVATE_KEY');
            console.log('   - FCM_TEST_TOKEN (for delivery tests)');
        }
        expect(true).toBe(true); // Always pass
    });
});
