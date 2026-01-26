import { test, expect } from '@playwright/test';
import { mockAuth, mockBaseApi, performLogin } from '../helpers';
import { SELECTORS, MOCK_DATA } from '../config';

test.describe('Authentication & Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await mockAuth(page);
        await mockBaseApi(page);
    });

    test('should login successfully and show dashboard', async ({ page }) => {
        await performLogin(page);

        // Verify dashboard elements
        await expect(page.locator('h2')).toContainText('Dashboard', { ignoreCase: true });
        await expect(page.locator(SELECTORS.dashboard.totalNotifications)).toBeVisible();
        await expect(page.getByText(`${MOCK_DATA.stats.notifications.total}`, { exact: true })).toBeVisible();
    });

    test('should fail login with invalid credentials', async ({ page }) => {
        await page.route('**/admin/login', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: { message: 'Invalid email or password' } }),
            });
        });

        await page.goto('/');
        await page.fill(SELECTORS.login.emailInput, 'wrong@example.com');
        await page.fill(SELECTORS.login.passwordInput, 'wrongpass');
        await page.click(SELECTORS.login.submitButton);

        // Verify error message
        await expect(page.locator('text=Invalid email or password')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate through all sidebar tabs', async ({ page }) => {
        await performLogin(page);

        const tabs = [
            { selector: SELECTORS.sidebar.sendContent, expected: 'send' },
            { selector: SELECTORS.sidebar.campaigns, expected: 'campaigns' },
            { selector: SELECTORS.sidebar.abTesting, expected: 'A/B Testing' },
            { selector: SELECTORS.sidebar.templates, expected: 'templates' },
            { selector: SELECTORS.sidebar.users, expected: 'users' },
            { selector: SELECTORS.sidebar.automation, expected: 'automation' },
            { selector: SELECTORS.sidebar.devx, expected: 'SDKs & Webhooks' },
            { selector: SELECTORS.sidebar.audit, expected: 'audit' },
            { selector: SELECTORS.sidebar.apps, expected: 'apps' },
        ];

        for (const tab of tabs) {
            await page.click(tab.selector);
            await expect(page.locator('h2')).toContainText(tab.expected, { ignoreCase: true });
        }
    });

    test('should logout successfully', async ({ page }) => {
        await performLogin(page);
        await page.click(SELECTORS.sidebar.logout);

        // Verify redirected to login
        await expect(page.locator(SELECTORS.login.submitButton)).toBeVisible();
    });
});
