import { test, expect } from '@playwright/test';
import { mockAuth, mockBaseApi, performLogin } from '../helpers';
import { SELECTORS, MOCK_DATA } from '../config';

test.describe('Compliance & Users', () => {
    test.beforeEach(async ({ page }) => {
        await mockAuth(page);
        await mockBaseApi(page);
        await performLogin(page);
    });

    test('should search and filter audit logs', async ({ page }) => {
        await page.click(SELECTORS.sidebar.audit);

        await expect(page.getByText(/UPDATE CREDENTIALS/i)).toBeVisible();

        // Search
        await page.fill('[placeholder="Search by action, actor, or details..."]', 'admin');
        // Filter verification (category)
        await page.selectOption('select:has-text("All Categories")', { label: 'Security' });

        await expect(page.locator('tbody td').getByText('security').first()).toBeVisible();
    });

    test('should view user details and deactivate device', async ({ page }) => {
        // Mock initial list
        await page.route('**/users?*', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                users: [{
                    id: 'usr_1',
                    externalUserId: 'customer_123',
                    app: { name: 'Consumer App' },
                    language: 'en',
                    timezone: 'UTC',
                    createdAt: new Date().toISOString(),
                    _count: { devices: 1 }
                }],
                pagination: { total: 1, totalPages: 1, page: 1, limit: 10 }
            })
        }));

        // Mock detail view
        await page.route('**/users/usr_1', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 'usr_1',
                externalUserId: 'customer_123',
                app: { name: 'Consumer App' },
                language: 'en',
                timezone: 'UTC',
                createdAt: new Date().toISOString(),
                devices: [{
                    id: 'dev_1',
                    platform: 'ios',
                    provider: 'apns',
                    pushToken: 'token_123',
                    isActive: true,
                    lastSeenAt: new Date().toISOString()
                }]
            })
        }));

        await page.click(SELECTORS.sidebar.users);
        await expect(page.getByText('customer_123')).toBeVisible();

        await Promise.all([
            page.waitForResponse('**/users/usr_1'),
            page.getByRole('button', { name: 'View' }).click()
        ]);

        // Wait for the detail content to appear
        await expect(page.getByText('Registered Devices')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

        // Deactivate device
        page.on('dialog', async dialog => {
            await dialog.accept();
        });

        await page.route('**/devices/dev_1/deactivate', (route) => route.fulfill({ status: 200 }));
        await page.click('button:has-text("Deactivate")');
    });
});
