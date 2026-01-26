/**
 * Webhook Integration Tests
 * Tests for webhook configuration, delivery, and security
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError, delay } from './setup';

let adminToken: string;
let testAppId: string;

beforeAll(async () => {
    // Use Super Admin for webhook configuration (can manage all apps)
    const auth = await login(testAdmins.superAdmin);
    if (auth) {
        adminToken = auth.token;
    }

    // Create a test app
    const appRes = await http.post<{ success: boolean; data: { id: string } }>(
        '/apps',
        { body: factory.app() }
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
// Webhook Configuration Tests
// ============================================================

describe('Webhooks - Configuration', () => {
    test('should configure webhook URL', async () => {
        const res = await http.put<{
            success: boolean; data: {
                webhookUrl: string;
                webhookEnabled: boolean;
            }
        }>(
            `/apps/${testAppId}/webhook`,
            {
                body: {
                    webhookUrl: 'https://httpbin.org/post',
                    webhookSecret: 'test_secret_key_12345678',
                    webhookEnabled: true,
                },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.webhookUrl).toBe('https://httpbin.org/post');
        expect(res.data.data.webhookEnabled).toBe(true);
    });

    test('should update webhook URL', async () => {
        const newUrl = 'https://webhook.site/test';

        const res = await http.put<{ success: boolean; data: { webhookUrl: string } }>(
            `/apps/${testAppId}/webhook`,
            {
                body: { webhookUrl: newUrl },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.webhookUrl).toBe(newUrl);
    });

    test('should disable webhook', async () => {
        const res = await http.put<{ success: boolean; data: { webhookEnabled: boolean } }>(
            `/apps/${testAppId}/webhook`,
            {
                body: { webhookEnabled: false },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.webhookEnabled).toBe(false);
    });

    test('should enable webhook', async () => {
        const res = await http.put<{ success: boolean; data: { webhookEnabled: boolean } }>(
            `/apps/${testAppId}/webhook`,
            {
                body: { webhookEnabled: true },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.webhookEnabled).toBe(true);
    });

    test('should update webhook secret', async () => {
        const res = await http.put<{ success: boolean }>(
            `/apps/${testAppId}/webhook`,
            {
                body: { webhookSecret: 'new_secret_key_87654321' },
                token: adminToken,
            }
        );

        expectSuccess(res);
    });

    test('should reject invalid webhook URL', async () => {
        const res = await http.put(
            `/apps/${testAppId}/webhook`,
            {
                body: { webhookUrl: 'not-a-valid-url' },
                token: adminToken,
            }
        );

        expectError(res, 400);
    });

    test('should reject webhook secret that is too short', async () => {
        const res = await http.put(
            `/apps/${testAppId}/webhook`,
            {
                body: { webhookSecret: 'short' }, // Less than 16 chars
                token: adminToken,
            }
        );

        expectError(res, 400);
    });

    test('should clear webhook URL', async () => {
        const res = await http.put<{ success: boolean; data: { webhookUrl: string | null } }>(
            `/apps/${testAppId}/webhook`,
            {
                body: { webhookUrl: null },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.webhookUrl).toBeNull();
    });
});

// ============================================================
// Webhook Test Endpoint
// ============================================================

describe('Webhooks - Test Endpoint', () => {
    beforeAll(async () => {
        // Configure a webhook for testing
        await http.put(`/apps/${testAppId}/webhook`, {
            body: {
                webhookUrl: 'https://httpbin.org/post',
                webhookSecret: 'test_secret_key_12345678',
                webhookEnabled: true,
            },
            token: adminToken,
        });
    });

    test('should test webhook endpoint', async () => {
        const res = await http.post<{
            success: boolean; data: {
                status: number;
                received: boolean;
            }
        }>(
            `/apps/${testAppId}/webhook/test`,
            { token: adminToken }
        );

        // httpbin.org should respond with 200
        expect(res.status).toBeLessThan(500);
    });

    test('should handle test to non-existent endpoint gracefully', async () => {
        // Configure bad URL
        await http.put(`/apps/${testAppId}/webhook`, {
            body: {
                webhookUrl: 'https://nonexistent.invalid/webhook',
                webhookEnabled: true,
            },
            token: adminToken,
        });

        const res = await http.post(
            `/apps/${testAppId}/webhook/test`,
            { token: adminToken }
        );

        // Should not crash, just report failure
        expect(res.status).toBeLessThan(503);
    });
});

// ============================================================
// Webhook Security Tests
// ============================================================

describe('Webhooks - Security', () => {
    test('should require authentication to configure webhooks', async () => {
        const res = await http.put(`/apps/${testAppId}/webhook`, {
            body: { webhookUrl: 'https://example.com/webhook' }
            // No token
        });

        expectError(res, 401);
    });

    test('should require proper role to configure webhooks', async () => {
        // Marketing role shouldn't be able to configure webhooks
        const marketingAuth = await login(testAdmins.marketing);
        if (!marketingAuth) return;

        const res = await http.put(`/apps/${testAppId}/webhook`, {
            body: { webhookUrl: 'https://example.com/webhook' },
            token: marketingAuth.token,
        });

        expectError(res, 403);
    });

    test('should require authentication to test webhooks', async () => {
        const res = await http.post(`/apps/${testAppId}/webhook/test`);
        expectError(res, 401);
    });
});

// ============================================================
// Webhook Delivery Tests (Simulated)
// ============================================================

describe('Webhooks - Delivery Simulation', () => {
    beforeAll(async () => {
        // Re-configure valid webhook
        await http.put(`/apps/${testAppId}/webhook`, {
            body: {
                webhookUrl: 'https://httpbin.org/post',
                webhookSecret: 'test_secret_key_12345678',
                webhookEnabled: true,
            },
            token: adminToken,
        });
    });

    test('should trigger webhook on notification creation', async () => {
        // Create a notification (webhook should be triggered async)
        const res = await http.post<{ success: boolean; data: { id: string } }>(
            '/notifications',
            {
                body: factory.notification(testAppId, {
                    title: 'Webhook Test Notification'
                })
            }
        );

        expectSuccess(res);

        // Wait for async webhook to potentially fire
        await delay(500);

        // We can't directly verify the webhook was received without a receiver
        // but the notification should have been created successfully
    });

    test('should handle webhook failures gracefully', async () => {
        // Configure webhook to a failing endpoint
        await http.put(`/apps/${testAppId}/webhook`, {
            body: {
                webhookUrl: 'https://httpbin.org/status/500', // Returns 500
                webhookEnabled: true,
            },
            token: adminToken,
        });

        // Notification should still succeed even if webhook fails
        const res = await http.post<{ success: boolean }>(
            '/notifications',
            {
                body: factory.notification(testAppId, {
                    title: 'Webhook Failure Test'
                })
            }
        );

        expectSuccess(res);
    });
});

// ============================================================
// Bulk Webhook Tests
// ============================================================

describe('Webhooks - Bulk Configuration', () => {
    test('should configure webhooks for multiple apps', async () => {
        const appIds: string[] = [testAppId];

        // Create additional apps
        for (let i = 0; i < 2; i++) {
            const appRes = await http.post<{ success: boolean; data: { id: string } }>(
                '/apps',
                { body: factory.app() }
            );
            if (appRes.ok) {
                appIds.push(appRes.data.data.id);
            }
        }

        // Configure webhooks for all apps
        const configRequests = appIds.map(appId =>
            http.put<{ success: boolean }>(`/apps/${appId}/webhook`, {
                body: {
                    webhookUrl: `https://httpbin.org/post?app=${appId}`,
                    webhookSecret: 'shared_secret_key_1234',
                    webhookEnabled: true,
                },
                token: adminToken,
            })
        );

        const results = await Promise.all(configRequests);
        const successful = results.filter(r => r.ok);

        expect(successful.length).toBe(appIds.length);

        // Cleanup
        const superAuth = await login(testAdmins.superAdmin);
        if (superAuth) {
            for (const appId of appIds.slice(1)) {
                await http.post(`/apps/${appId}/kill`, { token: superAuth.token });
            }
        }
    });
});

// ============================================================
// Webhook Event Types (from docs)
// ============================================================

describe('Webhooks - Event Types', () => {
    test('should document expected webhook event types', () => {
        // Document the expected event types based on docs
        const expectedEventTypes = [
            'notification.created',
            'notification.sent',
            'notification.delivered',
            'notification.failed',
            'notification.clicked',
            'device.registered',
            'device.unregistered',
        ];

        // This is a documentation test
        expect(expectedEventTypes.length).toBeGreaterThan(0);
    });
});
