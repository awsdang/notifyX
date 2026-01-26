import { Page } from '@playwright/test';
import { MOCK_DATA } from './config';

export async function mockAuth(page: Page) {
    await page.route('**/admin/login', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                user: MOCK_DATA.user,
                token: MOCK_DATA.user.token
            }),
        });
    });

    await page.route('**/admin/me', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_DATA.user),
        });
    });
}

export async function mockBaseApi(page: Page) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    };

    // Mock Apps
    await page.route('**/apps', async (route) => {
        await route.fulfill({
            status: 200,
            headers: corsHeaders,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_DATA.apps),
        });
    });

    // Mock Stats
    await page.route('**/stats', async (route) => {
        await route.fulfill({
            status: 200,
            headers: corsHeaders,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_DATA.stats),
        });
    });

    // Mock Audit Logs
    await page.route('**/audit-logs*', async (route) => {
        await route.fulfill({
            status: 200,
            headers: corsHeaders,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: 'aud_1',
                    timestamp: new Date().toISOString(),
                    actor: 'admin@notifyx.io',
                    action: 'UPDATE_CREDENTIALS',
                    resource: 'App: Consumer',
                    category: 'security',
                    details: 'APNS rotated',
                    severity: 'info'
                }
            ]),
        });
    });
}

export async function performLogin(page: Page) {
    await page.goto('/');
    await page.fill('input[type="email"]', 'super@test.local');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In"), button:has-text("Login")');
}
