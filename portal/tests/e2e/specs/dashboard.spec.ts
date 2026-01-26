import { test, expect } from '@playwright/test';
import { mockAuth, mockBaseApi, performLogin } from '../helpers';
import { SELECTORS, MOCK_DATA } from '../config';

test.describe('Dashboard Functionality', () => {
    test.beforeEach(async ({ page }) => {
        await mockAuth(page);
        await mockBaseApi(page);
        await performLogin(page);
    });

    test('should display all stat cards correctly', async ({ page }) => {
        await expect(page.locator(SELECTORS.dashboard.totalNotifications)).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(`${MOCK_DATA.stats.notifications.total}`, { exact: true })).toBeVisible({ timeout: 10000 });

        await expect(page.locator(SELECTORS.dashboard.successRate)).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(`${MOCK_DATA.stats.delivery.successRate}%`, { exact: true })).toBeVisible({ timeout: 10000 });
    });

    test('should display delivery insights grid', async ({ page }) => {
        await expect(page.locator('text=Delivery Insights')).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(`${MOCK_DATA.stats.notifications.thisWeek}`, { exact: true })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(`${MOCK_DATA.stats.notifications.pending}`, { exact: true })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(`${MOCK_DATA.stats.resources.devices}`, { exact: true })).toBeVisible({ timeout: 15000 });
    });

    test('should route to automation via "Start Builder" button', async ({ page }) => {
        await page.click(SELECTORS.dashboard.startBuilder);
        await expect(page.locator('h2')).toContainText('Automation', { ignoreCase: true });
    });

    test('should route to credentials via "Manage Keys" link', async ({ page }) => {
        await page.click(SELECTORS.dashboard.manageKeys);
        await expect(page.locator('h2')).toContainText('Credentials', { ignoreCase: true });
    });

    test('should show activity feed', async ({ page }) => {
        await expect(page.locator('h3:has-text("Recent Activity")')).toBeVisible({ timeout: 10000 });
    });
});
