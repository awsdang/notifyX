import { test, expect } from '@playwright/test';
import { mockAuth, mockBaseApi, performLogin } from '../helpers';
import { SELECTORS, MOCK_DATA } from '../config';

test.describe('Campaigns Management', () => {
    test.beforeEach(async ({ page }) => {
        await mockAuth(page);
        await mockBaseApi(page);

        // Mock campaigns list
        await page.route('**/campaigns', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: 'cam_1',
                        appId: 'app_1',
                        name: 'New Year Sale',
                        status: 'DRAFT',
                        targetingMode: 'ALL',
                        totalTargets: 50000,
                        sentCount: 0,
                        deliveredCount: 0,
                        failedCount: 0,
                        title: 'Happy New Year!',
                        body: 'Get 50% off everything.'
                    }
                ]),
            });
        });

        await performLogin(page);
        await page.click(SELECTORS.sidebar.campaigns);
    });

    test('should show campaign list and stats', async ({ page }) => {
        await expect(page.getByText('New Year Sale', { exact: true })).toBeVisible();
        await expect(page.getByText('DRAFT', { exact: true })).toBeVisible();

        // Open stats slide-over
        await page.click('button[title="View Stats"]');
        await expect(page.locator('h3:has-text("Campaign Insights")')).toBeVisible();
        await expect(page.locator('text=Delivery Breakdown')).toBeVisible();
    });

    test('should create a new campaign', async ({ page }) => {
        // Mock audience estimate BEFORE we even open the modal
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        await page.route('**/campaigns/audience-estimate', async (route) => {
            if (route.request().method() === 'OPTIONS') {
                await route.fulfill({ status: 204, headers: corsHeaders });
            } else {
                await route.fulfill({
                    status: 200,
                    headers: corsHeaders,
                    contentType: 'application/json',
                    body: JSON.stringify({ users: 1000, devices: 1500 }),
                });
            }
        });

        await page.click('button:has-text("New Campaign")');
        await expect(page.getByRole('dialog')).toBeVisible();

        // Fill form
        await page.selectOption('select:has-text("Select an App")', { label: 'Consumer App' });

        await page.fill('[placeholder="e.g., Black Friday Sale"]', 'Test Campaign');
        await page.fill('[placeholder="Title *"]', 'Test Title');
        await page.fill('[placeholder="Body *"]', 'Test Body content.');

        await expect(page.getByText('1000 users • 1500 devices')).toBeVisible({ timeout: 10000 });

        // Submit
        await page.route('**/campaigns', async (route) => {
            if (route.request().method() === 'OPTIONS') {
                await route.fulfill({ status: 204, headers: corsHeaders });
            } else {
                await route.fulfill({ status: 201, headers: corsHeaders });
            }
        });
        await page.getByRole('button', { name: 'Create Campaign', exact: true }).click();

        // Verify modal closed - check for the dialog to be hidden
        await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15000 });
    });

    test('should send campaign now', async ({ page }) => {
        await page.route('**/campaigns/cam_1/send', (route) => route.fulfill({ status: 200 }));
        await page.click('button[title="Send Now"]');
        // Refresh check or status change check
    });

    test('should schedule campaign', async ({ page }) => {
        // Mock prompt
        page.on('dialog', async dialog => {
            await dialog.accept('2026-12-31 23:59');
        });

        await page.route('**/campaigns/cam_1/schedule', (route) => {
            expect(route.request().postDataJSON().scheduledAt).toBeDefined();
            return route.fulfill({ status: 200 });
        });

        await page.click('button[title="Schedule"]');
    });
});
