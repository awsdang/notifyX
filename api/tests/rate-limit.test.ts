/**
 * Rate Limiting Tests
 * Tests for API rate limits (max 100 pushes/second) and throttling behavior
 */

import { describe, test, expect, beforeAll, afterAll, it, mock, spyOn, beforeEach } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, MAX_PUSHES_PER_SECOND, delay, batchedRequests } from './setup';

let adminToken: string;
let testAppId: string;

beforeAll(async () => {
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
        await http.post(`/apps/${testAppId}/kill`, { token: adminToken });
    }
    await cleanup.runAll(adminToken);
});

// ============================================================
// Rate Limit Configuration Tests
// ============================================================

describe('Rate Limiting - Configuration', () => {
    test('should have max rate of 100 pushes/second', () => {
        expect(MAX_PUSHES_PER_SECOND).toBe(100);
    });
});

// ============================================================
// Notification Rate Limit Tests
// ============================================================

describe('Rate Limiting - Notifications', () => {
    test('should handle exactly 100 notification requests', async () => {
        const requests = Array.from({ length: 100 }, (_, i) => () =>
            http.post<{ success: boolean }>('/notifications', {
                body: factory.notification(testAppId, { title: `RateLimit_${i}` })
            })
        );

        const startTime = Date.now();
        const results = await batchedRequests(requests, 50, 50);
        const duration = Date.now() - startTime;

        const successful = results.filter(r => r.ok);
        const failed = results.filter(r => !r.ok);

        console.log(`100 requests: ${successful.length} succeeded, ${failed.length} failed in ${duration}ms`);

        // Most should succeed
        expect(successful.length).toBeGreaterThan(80);
    });

    test('should handle burst of 50 requests in parallel', async () => {
        const requests = Array.from({ length: 50 }, (_, i) =>
            http.post<{ success: boolean }>('/notifications', {
                body: factory.notification(testAppId, { title: `Burst_${i}` })
            })
        );

        const startTime = Date.now();
        const results = await Promise.all(requests);
        const duration = Date.now() - startTime;

        const successful = results.filter(r => r.ok);

        console.log(`50-request burst: ${successful.length} succeeded in ${duration}ms`);

        // All should succeed for a 50-request burst
        expect(successful.length).toBe(50);
    });

    test('should demonstrate rate limit behavior with 150 requests', async () => {
        const requests = Array.from({ length: 150 }, (_, i) => () =>
            http.post<{ success: boolean }>('/notifications', {
                body: factory.notification(testAppId, { title: `OverLimit_${i}` })
            })
        );

        const startTime = Date.now();
        const results = await batchedRequests(requests, 50, 100);
        const duration = Date.now() - startTime;

        const successful = results.filter(r => r.ok);
        const rateLimited = results.filter(r => r.status === 429);

        console.log(`150 requests: ${successful.length} succeeded, ${rateLimited.length} rate-limited in ${duration}ms`);

        // Should succeed (either all pass or some are rate-limited)
        expect(successful.length + rateLimited.length).toBe(150);
    });
});

// ============================================================
// Sustained Load Tests
// ============================================================

describe('Rate Limiting - Sustained Load', () => {
    test('should handle sustained 50 req/sec for 3 seconds', async () => {
        const requestsPerSecond = 50;
        const durationSeconds = 3;
        const totalRequests = requestsPerSecond * durationSeconds;

        const allResults: Array<{ ok: boolean; status: number }> = [];

        for (let second = 0; second < durationSeconds; second++) {
            const batch = Array.from({ length: requestsPerSecond }, (_, i) =>
                http.post<{ success: boolean }>('/notifications', {
                    body: factory.notification(testAppId, {
                        title: `Sustained_${second}_${i}`
                    })
                })
            );

            const batchResults = await Promise.all(batch);
            allResults.push(...batchResults);

            // Wait for next second
            if (second < durationSeconds - 1) {
                await delay(1000);
            }
        }

        const successful = allResults.filter(r => r.ok);
        console.log(`Sustained ${requestsPerSecond}/sec for ${durationSeconds}s: ${successful.length}/${totalRequests} succeeded`);

        // Should handle sustained load within limits
        expect(successful.length).toBeGreaterThan(totalRequests * 0.8);
    });

    test('should handle sustained 50 req/sec for 30 seconds', async () => {
        const requestsPerSecond = 50;
        const durationSeconds = 30;
        const totalRequests = requestsPerSecond * durationSeconds;

        const allResults: Array<{ ok: boolean; status: number }> = [];

        for (let second = 0; second < durationSeconds; second++) {
            const batch = Array.from({ length: requestsPerSecond }, (_, i) =>
                http.post<{ success: boolean }>('/notifications', {
                    body: factory.notification(testAppId, {
                        title: `Sustained_${second}_${i}`
                    })
                })
            );

            const batchResults = await Promise.all(batch);
            allResults.push(...batchResults);

            // Wait for next second
            if (second < durationSeconds - 1) {
                await delay(1000);
            }
        }

        const successful = allResults.filter(r => r.ok);
        console.log(`Sustained ${requestsPerSecond}/sec for ${durationSeconds}s: ${successful.length}/${totalRequests} succeeded`);

        // Should handle sustained load within limits
        expect(successful.length).toBeGreaterThan(totalRequests * 0.8);
    });

    test('should handle sustained 100 req/sec for 2 seconds', async () => {
        const requestsPerSecond = 100;
        const durationSeconds = 2;
        const totalRequests = requestsPerSecond * durationSeconds;

        const allResults: Array<{ ok: boolean; status: number }> = [];

        for (let second = 0; second < durationSeconds; second++) {
            const batch = Array.from({ length: requestsPerSecond }, (_, i) =>
                http.post<{ success: boolean }>('/notifications', {
                    body: factory.notification(testAppId, {
                        title: `Sustained_${second}_${i}`
                    })
                })
            );

            const batchResults = await Promise.all(batch);
            allResults.push(...batchResults);

            // Wait for next second
            if (second < durationSeconds - 1) {
                await delay(1000);
            }
        }

        const successful = allResults.filter(r => r.ok);
        console.log(`Sustained ${requestsPerSecond}/sec for ${durationSeconds}s: ${successful.length}/${totalRequests} succeeded`);

        // Should handle sustained load within limits
        expect(successful.length).toBeGreaterThan(totalRequests * 0.8);
    });
});

// ============================================================
// Recovery Tests
// ============================================================

describe('Rate Limiting - Recovery', () => {
    test('should recover after rate limit window', async () => {
        // First, saturate with requests
        const burst1 = Array.from({ length: 100 }, () =>
            http.post<{ success: boolean }>('/notifications', {
                body: factory.notification(testAppId, { title: 'RecoveryBurst1' })
            })
        );
        await Promise.all(burst1);

        // Wait for rate limit window to reset
        await delay(2000);

        // Second burst should work
        const burst2 = Array.from({ length: 50 }, () =>
            http.post<{ success: boolean }>('/notifications', {
                body: factory.notification(testAppId, { title: 'RecoveryBurst2' })
            })
        );
        const results = await Promise.all(burst2);

        const successful = results.filter(r => r.ok);
        expect(successful.length).toBe(50);
    });
});

// ============================================================
// Priority Queue Rate Limiting
// ============================================================

describe('Rate Limiting - Priority Queues', () => {
    test('should handle HIGH priority notifications under load', async () => {
        // Send HIGH priority notifications
        const highPriorityRequests = Array.from({ length: 30 }, (_, i) =>
            http.post<{ success: boolean; data: { priority: string } }>('/notifications', {
                body: factory.notification(testAppId, {
                    priority: 'HIGH',
                    title: `HighPriority_${i}`
                })
            })
        );

        const results = await Promise.all(highPriorityRequests);
        const successful = results.filter(r => r.ok);

        // All HIGH priority should succeed
        expect(successful.length).toBe(30);
    });

    test('should handle mixed priority under load', async () => {
        const priorities = ['LOW', 'NORMAL', 'HIGH'] as const;

        const requests = priorities.flatMap(priority =>
            Array.from({ length: 20 }, (_, i) =>
                http.post<{ success: boolean }>('/notifications', {
                    body: factory.notification(testAppId, {
                        priority,
                        title: `Mixed_${priority}_${i}`
                    })
                })
            )
        );

        const results = await Promise.all(requests);
        const successful = results.filter(r => r.ok);

        console.log(`Mixed priority: ${successful.length}/60 succeeded`);
        expect(successful.length).toBeGreaterThan(50);
    });
});

// ============================================================
// Other Endpoints Rate Limiting
// ============================================================

describe('Rate Limiting - Other Endpoints', () => {
    test('should not rate limit GET requests heavily', async () => {
        // GET requests should be less restricted
        const requests = Array.from({ length: 50 }, () =>
            http.get('/apps', { token: adminToken })
        );

        const results = await Promise.all(requests);
        const successful = results.filter(r => r.ok);

        // All should succeed
        expect(successful.length).toBe(50);
    });

    test('should handle rapid template creation', async () => {
        const auth = await login(testAdmins.marketing);
        if (!auth) return;

        const requests = Array.from({ length: 20 }, (_, i) => () =>
            http.post<{ success: boolean; data: { id: string } }>('/templates', {
                body: factory.template(testAppId, { name: `RateTemplate_${i}` }),
                token: auth.token,
            })
        );

        const results = await batchedRequests(requests, 10);
        const successful = results.filter(r => r.ok);

        // Track for cleanup
        for (const res of successful) {
            cleanup.trackTemplate(res.data.data.id);
        }

        expect(successful.length).toBe(20);
    });
});

// ============================================================
// Throughput Measurement
// ============================================================

describe('Rate Limiting - Throughput Measurement', () => {
    test('should measure actual throughput', async () => {
        const testSize = 100;
        const startTime = Date.now();

        const requests = Array.from({ length: testSize }, (_, i) => () =>
            http.post<{ success: boolean }>('/notifications', {
                body: factory.notification(testAppId, { title: `Throughput_${i}` })
            })
        );

        const results = await batchedRequests(requests, 25, 50);
        const duration = (Date.now() - startTime) / 1000;

        const successful = results.filter(r => r.ok);
        const throughput = successful.length / duration;

        console.log(`\nThroughput Test Results:`);
        console.log(`- Requests: ${testSize}`);
        console.log(`- Successful: ${successful.length}`);
        console.log(`- Duration: ${duration.toFixed(2)}s`);
        console.log(`- Throughput: ${throughput.toFixed(2)} req/sec`);
        console.log(`- Target Max: ${MAX_PUSHES_PER_SECOND} req/sec`);

        // Throughput should be reasonable
        expect(throughput).toBeGreaterThan(10);
    }, 10000);
});
