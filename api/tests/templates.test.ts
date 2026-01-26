/**
 * Templates API Tests
 * Tests for template CRUD, localization (EN/AR), and variable handling
 * Includes both single and bulk request tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError, batchedRequests } from './setup';

let adminToken: string;
let testAppId: string;

beforeAll(async () => {
    const auth = await login(testAdmins.marketing);
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
    await cleanup.runAll(adminToken);
    if (testAppId) {
        const superAuth = await login(testAdmins.superAdmin);
        if (superAuth) {
            await http.post(`/apps/${testAppId}/kill`, { token: superAuth.token });
        }
    }
});

// ============================================================
// Single Request Tests
// ============================================================

describe('Templates API - Single Requests', () => {
    test('should create a new template', async () => {
        const templateData = factory.template(testAppId);
        const res = await http.post<{ success: boolean; data: { id: string; eventName: string } }>(
            '/templates',
            { body: templateData, token: adminToken }
        );

        expectSuccess(res);
        expect(res.data.success).toBe(true);
        expect(res.data.data.eventName).toBe(templateData.eventName);

        cleanup.trackTemplate(res.data.data.id);
    });

    test('should get a template by ID', async () => {
        // Create template first
        const templateData = factory.template(testAppId);
        const createRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/templates',
            { body: templateData, token: adminToken }
        );
        expectSuccess(createRes);
        const templateId = createRes.data.data.id;
        cleanup.trackTemplate(templateId);

        // Get template
        const res = await http.get<{ success: boolean; data: { id: string; eventName: string } }>(
            `/templates/${templateId}`
        );

        expectSuccess(res);
        expect(res.data.data.id).toBe(templateId);
    });

    test('should update a template', async () => {
        // Create template first
        const createRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/templates',
            { body: factory.template(testAppId), token: adminToken }
        );
        expectSuccess(createRes);
        const templateId = createRes.data.data.id;
        cleanup.trackTemplate(templateId);

        // Update template
        const newTitle = 'Updated Title';
        const res = await http.put<{ success: boolean; data: { title: string } }>(
            `/templates/${templateId}`,
            { body: { title: newTitle }, token: adminToken }
        );

        expectSuccess(res);
        expect(res.data.data.title).toBe(newTitle);
    });

    test('should delete a template', async () => {
        // Create template first
        const createRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/templates',
            { body: factory.template(testAppId), token: adminToken }
        );
        expectSuccess(createRes);
        const templateId = createRes.data.data.id;

        // Delete template
        const res = await http.delete<{ success: boolean }>(
            `/templates/${templateId}`,
            { token: adminToken }
        );

        // 204 No Content
        expect(res.status).toBe(204);

        // Verify deleted
        const getRes = await http.get(`/templates/${templateId}`);
        expectError(getRes, 404);
    });

    test('should return 404 for non-existent template', async () => {
        const res = await http.get('/templates/non-existent-template-id');
        expectError(res, 404);
    });
});

// ============================================================
// Localization Tests (EN/AR)
// ============================================================

describe('Templates API - Localization', () => {
    test('should create template with English content', async () => {
        const templateData = factory.template(testAppId, {
            language: 'en',
            title: 'Hello {{name}}',
            body: 'Welcome to our platform!',
        });

        const res = await http.post<{ success: boolean; data: { id: string; language: string } }>(
            '/templates',
            { body: templateData, token: adminToken }
        );

        expectSuccess(res);
        expect(res.data.data.language).toBe('en');
        cleanup.trackTemplate(res.data.data.id);
    });

    test('should create template with Arabic RTL content', async () => {
        const templateData = factory.template(testAppId, {
            language: 'ar',
            title: 'مرحباً {{name}}',
            body: 'أهلاً بك في منصتنا!',
        });

        const res = await http.post<{ success: boolean; data: { id: string; language: string } }>(
            '/templates',
            { body: templateData, token: adminToken }
        );

        expectSuccess(res);
        expect(res.data.data.language).toBe('ar');
        cleanup.trackTemplate(res.data.data.id);
    });

    test('should create template with Kurdish content', async () => {
        const templateData = factory.template(testAppId, {
            language: 'ku',
            title: 'بەخێربێیت {{name}}',
            body: 'بەخێر بێیت بۆ پلاتفۆرمەکەمان!',
        });

        const res = await http.post<{ success: boolean; data: { id: string; language: string } }>(
            '/templates',
            { body: templateData, token: adminToken }
        );

        expectSuccess(res);
        expect(res.data.data.language).toBe('ku');
        cleanup.trackTemplate(res.data.data.id);
    });

    test('should update template language', async () => {
        // Create with English
        const createRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/templates',
            {
                body: factory.template(testAppId, { language: 'en', title: 'English Title' }),
                token: adminToken,
            }
        );
        expectSuccess(createRes);
        const templateId = createRes.data.data.id;
        cleanup.trackTemplate(templateId);

        // Update to Arabic
        const res = await http.put<{ success: boolean; data: { language: string; title: string } }>(
            `/templates/${templateId}`,
            {
                body: { language: 'ar', title: 'عنوان عربي' },
                token: adminToken,
            }
        );

        expectSuccess(res);
        expect(res.data.data.language).toBe('ar');
    });
});

// ============================================================
// Variable Validation Tests
// ============================================================

describe('Templates API - Variables', () => {
    test('should create template with variables', async () => {
        const templateData = factory.template(testAppId, {
            title: 'Order {{order_id}} Shipped',
            body: 'Hi {{customer_name}}, your order is on the way!',
            variables: ['order_id', 'customer_name'],
        });

        const res = await http.post<{ success: boolean; data: { id: string; variables: string[] } }>(
            '/templates',
            { body: templateData, token: adminToken }
        );

        expectSuccess(res);
        expect(res.data.data.variables).toContain('order_id');
        expect(res.data.data.variables).toContain('customer_name');
        cleanup.trackTemplate(res.data.data.id);
    });

    test('should create template with deeply nested variables', async () => {
        const templateData = factory.template(testAppId, {
            title: '{{user.firstName}}, check this out!',
            body: 'Your balance is {{account.balance}}',
            variables: ['user.firstName', 'account.balance'],
        });

        const res = await http.post<{ success: boolean; data: { id: string } }>(
            '/templates',
            { body: templateData, token: adminToken }
        );

        expectSuccess(res);
        cleanup.trackTemplate(res.data.data.id);
    });
});

// ============================================================
// Bulk Request Tests
// ============================================================

describe('Templates API - Bulk Requests', () => {
    test('should create 20 templates in parallel', async () => {
        const createRequests = Array.from({ length: 20 }, () => () =>
            http.post<{ success: boolean; data: { id: string } }>('/templates', {
                body: factory.template(testAppId),
                token: adminToken,
            })
        );

        const results = await batchedRequests(createRequests, 5);

        const successful = results.filter(r => r.ok);
        expect(successful.length).toBe(20);

        // Track for cleanup
        for (const res of successful) {
            cleanup.trackTemplate(res.data.data.id);
        }
    });

    test('should list templates with pagination', async () => {
        const res = await http.get<{ success: boolean; data: Array<{ id: string }> }>(
            '/templates'
        );

        expectSuccess(res);
        expect(Array.isArray(res.data.data)).toBe(true);
        expect(res.data.data.length).toBeGreaterThan(0);
    });

    test('should handle concurrent template updates', async () => {
        // Create a template
        const createRes = await http.post<{ success: boolean; data: { id: string } }>(
            '/templates',
            { body: factory.template(testAppId), token: adminToken }
        );
        expectSuccess(createRes);
        const templateId = createRes.data.data.id;
        cleanup.trackTemplate(templateId);

        // Concurrent updates
        const updateRequests = Array.from({ length: 5 }, (_, i) => () =>
            http.put(`/templates/${templateId}`, {
                body: { title: `ConcurrentUpdate_${i}` },
                token: adminToken,
            })
        );

        const results = await Promise.all(updateRequests.map(fn => fn()));
        const successful = results.filter(r => r.ok);
        expect(successful.length).toBe(5);
    });

    test('should create templates for multiple apps', async () => {
        // Create additional apps
        const appIds = [testAppId];
        for (let i = 0; i < 2; i++) {
            const appRes = await http.post<{ success: boolean; data: { id: string } }>(
                '/apps',
                { body: factory.app() }
            );
            if (appRes.ok) {
                appIds.push(appRes.data.data.id);
            }
        }

        // Create template for each app
        const createRequests = appIds.map(appId => () =>
            http.post<{ success: boolean; data: { id: string } }>('/templates', {
                body: factory.template(appId),
                token: adminToken,
            })
        );

        const results = await Promise.all(createRequests.map(fn => fn()));
        const successful = results.filter(r => r.ok);
        expect(successful.length).toBe(appIds.length);

        // Cleanup
        for (const res of successful) {
            cleanup.trackTemplate(res.data.data.id);
        }
    });
});
