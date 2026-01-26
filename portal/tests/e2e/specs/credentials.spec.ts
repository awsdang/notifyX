import { test, expect } from '@playwright/test';
import { mockAuth, mockBaseApi, performLogin } from '../helpers';
import { SELECTORS, MOCK_DATA } from '../config';

test.describe('App & Credentials Management', () => {
    test.beforeEach(async ({ page }) => {
        await mockAuth(page);
        await mockBaseApi(page);
        await performLogin(page);
    });

    test('should create a new app', async ({ page }) => {
        await page.click(SELECTORS.sidebar.apps);

        const appName = 'New Mobile App';
        page.on('dialog', async dialog => {
            if (dialog.type() === 'prompt') {
                await dialog.accept(appName);
            }
        });

        // Intercept POST and subsequent GET
        let created = false;
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        await page.route('**/apps', async (route) => {
            if (route.request().method() === 'OPTIONS') {
                await route.fulfill({ status: 204, headers: corsHeaders });
                return;
            }

            if (route.request().method() === 'POST') {
                created = true;
                await route.fulfill({ status: 201, headers: corsHeaders });
            } else {
                await route.fulfill({
                    status: 200,
                    headers: corsHeaders,
                    contentType: 'application/json',
                    body: JSON.stringify(created
                        ? [...MOCK_DATA.apps, { id: 'app_new', name: appName }]
                        : MOCK_DATA.apps
                    ),
                });
            }
        });

        // Wait for first load
        await expect(page.getByText('Consumer App')).toBeVisible();

        await page.getByRole('button', { name: /create app/i }).click();

        // Wait for the h4 containing the text specifically
        await expect(page.locator('h4', { hasText: appName })).toBeVisible({ timeout: 15000 });
    });

    test('should manage APNs credentials', async ({ page }) => {
        await page.click(SELECTORS.sidebar.credentials);
        await expect(page.getByText('Consumer App')).toBeVisible();
        await page.click('text=Consumer App');

        // Check if we need to click "Add Provider" first (if none exist)
        const addBtn = page.getByRole('button', { name: /add provider/i });
        if (await addBtn.isVisible()) {
            await addBtn.click();
        }

        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByText(/Apple Push \(APNs\)/i).click();

        await page.fill('[placeholder="Key ID"]', '89ABCDEF');
        await page.fill('[placeholder="Team ID"]', '12345678');

        // Mock save with CORS
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        await page.route('**/apns', async (route) => {
            if (route.request().method() === 'OPTIONS') {
                await route.fulfill({ status: 204, headers: corsHeaders });
            } else {
                await route.fulfill({ status: 200, headers: corsHeaders });
            }
        });

        await page.getByRole('button', { name: /save/i }).click();
        await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 });
    });

    test('should test FCM credentials', async ({ page }) => {
        await page.click(SELECTORS.sidebar.credentials);
        await expect(page.getByText('Consumer App')).toBeVisible();
        await page.click('text=Consumer App');

        const addBtn = page.getByRole('button', { name: /add provider/i });
        if (await addBtn.isVisible()) {
            await addBtn.click();
        }

        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByText(/Firebase \(FCM\)/i).click();

        // Mock test success
        await page.route('**/apps/app_1/credentials/fcm/test', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, message: 'FCM connection successful' })
        }));

        await page.fill('[placeholder="Key ID"]', 'AIza...');

        await page.getByRole('button', { name: /test/i }).click();
        await expect(page.getByText('FCM connection successful')).toBeVisible({ timeout: 10000 });
    });

    test('should show error on failed credential test', async ({ page }) => {
        await page.click(SELECTORS.sidebar.credentials);
        await expect(page.getByText('Consumer App')).toBeVisible();
        await page.click('text=Consumer App');

        const addBtn = page.getByRole('button', { name: /add provider/i });
        if (await addBtn.isVisible()) {
            await addBtn.click();
        }

        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByText(/Firebase \(FCM\)/i).click();

        // Mock test failure
        await page.route('**/apps/app_1/credentials/fcm/test', (route) => route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'Invalid server key structure' } })
        }));

        await page.fill('[placeholder="Key ID"]', 'invalid');

        await page.getByRole('button', { name: /test/i }).click();
        await expect(page.getByText('Invalid server key structure')).toBeVisible({ timeout: 10000 });
    });
});
