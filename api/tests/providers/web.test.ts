/**
 * Web Push Provider Tests
 * 
 * ⚠️ REQUIRES PROVIDER CREDENTIALS - SKIPPED BY DEFAULT
 * 
 * Run with: bun test tests/providers
 * 
 * These tests require:
 * - Valid VAPID keys (public and private)
 * - A real web push subscription for testing
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError, batchedRequests } from '../setup';

// Skip all tests if no Web Push credentials are available
const WEB_PUSH_CREDENTIALS_AVAILABLE = Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
);

let adminToken: string;
let testAppId: string;

beforeAll(async () => {
    if (!WEB_PUSH_CREDENTIALS_AVAILABLE) {
        console.log('⚠️  Web Push credentials not available. Skipping provider tests.');
        return;
    }

    const auth = await login(testAdmins.manager);
    if (auth) {
        adminToken = auth.token;
    }

    // Create a test app
    const appRes = await http.post<{ success: boolean; data: { id: string } }>(
        '/apps',
        { body: factory.app({ platforms: { web: true } }) }
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
// Web Push Credential Configuration Tests
// ============================================================

describe('Web Push Provider - Credential Configuration', () => {
    const skipIfNoCredentials = () => {
        if (!WEB_PUSH_CREDENTIALS_AVAILABLE) {
            console.log('Skipping: Web Push credentials not configured');
            return true;
        }
        return false;
    };

    test('should set Web Push credentials (VAPID keys)', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.post<{ success: boolean; data: { provider: string; isActive: boolean } }>(
            `/apps/${testAppId}/credentials`,
            {
                body: {
                    provider: 'web',
                    vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
                    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
                    subject: process.env.VAPID_SUBJECT || 'mailto:test@example.com',
                },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.provider).toBe('web');
        expect(res.data.data.isActive).toBe(true);
    });

    test('should get Web Push credentials (without secrets)', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.get<{ success: boolean; data: Array<{ provider: string }> }>(
            `/apps/${testAppId}/credentials`,
            { token: adminToken }
        );

        expectSuccess(res);
        const web = res.data.data.find(c => c.provider === 'web');
        expect(web).toBeDefined();
    });

    test('should test Web Push credentials', async () => {
        if (skipIfNoCredentials()) return;

        const testSubscription = process.env.WEB_PUSH_TEST_SUBSCRIPTION;
        if (!testSubscription) {
            console.log('Skipping: No WEB_PUSH_TEST_SUBSCRIPTION provided');
            return;
        }

        const res = await http.post<{ success: boolean; data: { success: boolean } }>(
            `/apps/${testAppId}/credentials/web/test`,
            {
                body: { testToken: testSubscription },
                token: adminToken,
            }
        );

        expect(res.status).toBeLessThan(500);
    });

    test('should toggle Web Push credential active status', async () => {
        if (skipIfNoCredentials()) return;

        // Disable
        const disableRes = await http.patch<{ success: boolean; data: { isActive: boolean } }>(
            `/apps/${testAppId}/credentials/web`,
            {
                body: { isActive: false },
                token: adminToken,
            }
        );
        expectSuccess(disableRes);
        expect(disableRes.data.data.isActive).toBe(false);

        // Re-enable
        const enableRes = await http.patch<{ success: boolean; data: { isActive: boolean } }>(
            `/apps/${testAppId}/credentials/web`,
            {
                body: { isActive: true },
                token: adminToken,
            }
        );
        expectSuccess(enableRes);
        expect(enableRes.data.data.isActive).toBe(true);
    });

    test('should delete Web Push credentials', async () => {
        if (skipIfNoCredentials()) return;

        const res = await http.delete<{ success: boolean }>(
            `/apps/${testAppId}/credentials/web`,
            { token: adminToken }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Web Push Notification Tests
// ============================================================

describe('Web Push Provider - Notification Delivery', () => {
    const skipIfNoCredentials = () => {
        if (!WEB_PUSH_CREDENTIALS_AVAILABLE) {
            console.log('Skipping: Web Push credentials not configured');
            return true;
        }
        return false;
    };

    test('should send single notification to browser', async () => {
        if (skipIfNoCredentials()) return;

        const testSubscription = process.env.WEB_PUSH_TEST_SUBSCRIPTION;
        if (!testSubscription) return;

        // Ensure credentials are set
        await http.post(`/apps/${testAppId}/credentials`, {
            body: {
                provider: 'web',
                vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
                vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
                subject: process.env.VAPID_SUBJECT || 'mailto:test@example.com',
            },
            token: adminToken,
        });

        // Create user with web subscription
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
                platform: 'web',
                token: testSubscription,
            }
        });

        // Send notification
        const res = await http.post<{ success: boolean }>('/notifications', {
            body: factory.notification(testAppId, {
                title: 'Web Push Test',
                body: 'Testing browser push notification',
                userIds: [userId],
            })
        });

        expectSuccess(res);
    });

    test('should send bulk notifications to multiple browsers', async () => {
        if (skipIfNoCredentials()) return;

        const testSubscriptions = process.env.WEB_PUSH_TEST_SUBSCRIPTIONS?.split('|||') || [];
        if (testSubscriptions.length < 2) {
            console.log('Skipping: Need multiple WEB_PUSH_TEST_SUBSCRIPTIONS for bulk test');
            return;
        }

        const userIds: string[] = [];
        for (const subscription of testSubscriptions) {
            const userRes = await http.post<{ success: boolean; data: { id: string } }>('/users', {
                body: { ...factory.user(), appId: testAppId }
            });
            if (!userRes.ok) continue;
            const userId = userRes.data.data.id;
            userIds.push(userId);
            cleanup.trackUser(userId);

            await http.post('/users/device', {
                body: { userId, appId: testAppId, platform: 'web', token: subscription }
            });
        }

        const res = await http.post<{ success: boolean }>('/notifications', {
            body: factory.notification(testAppId, {
                title: 'Web Push Bulk Test',
                body: 'Testing bulk browser push',
                userIds,
            })
        });

        expectSuccess(res);
    });
});

// ============================================================
// Web Push Subscription Handling
// ============================================================

describe('Web Push Provider - Subscription Handling', () => {
    test('should handle expired subscription gracefully', async () => {
        if (!WEB_PUSH_CREDENTIALS_AVAILABLE) return;

        // Test with an invalid/expired subscription
        const res = await http.post(
            `/apps/${testAppId}/credentials/web/test`,
            {
                body: { testToken: '{"endpoint":"https://invalid.push.service/expired","keys":{}}' },
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

describe('Web Push Provider - Availability Check', () => {
    test('should report Web Push credential availability', () => {
        if (WEB_PUSH_CREDENTIALS_AVAILABLE) {
            console.log('✅ Web Push credentials are configured');
        } else {
            console.log('⚠️  Web Push credentials not configured.');
            console.log('   Set the following environment variables to run Web Push tests:');
            console.log('   - VAPID_PUBLIC_KEY');
            console.log('   - VAPID_PRIVATE_KEY');
            console.log('   - VAPID_SUBJECT');
            console.log('   - WEB_PUSH_TEST_SUBSCRIPTION (for delivery tests)');
        }
        expect(true).toBe(true);
    });
});
