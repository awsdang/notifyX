
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { http, factory, cleanup, login, testAdmins, expectSuccess, expectError } from './setup';
import { prisma } from '../src/services/database';

describe('Campaign Approvals', () => {
    let adminToken: string;
    let appId: string;
    let campaignId: string;

    beforeAll(async () => {
        // Login as super admin
        const auth = await login(testAdmins.superAdmin);
        if (auth) {
            adminToken = auth.token;
        }

        // Create an app
        const appRes = await http.post<{ success: boolean; data: { id: string } }>('/apps', {
            body: factory.app(),
            token: adminToken,
        });
        if (appRes.ok) {
            appId = appRes.data.data.id;
            cleanup.trackApp(appId);
        }
    });

    afterAll(async () => {
        await cleanup.runAll(adminToken);
    });

    test('Create DRAFT campaign', async () => {
        const res = await http.post<{ success: boolean; data: any }>('/campaigns', {
            body: {
                appId,
                name: "Approval Test Campaign",
                title: "Test Title",
                body: "Test Body",
                targetingMode: "ALL",
                status: "DRAFT"
            },
            token: adminToken
        });

        expectSuccess(res);
        expect(res.data.data.status).toBe("DRAFT");
        campaignId = res.data.data.id;
    });

    test('Submit campaign for review', async () => {
        const res = await http.post<{ success: boolean; data: any }>(
            `/campaigns/${campaignId}/submit-review`,
            { token: adminToken }
        );

        expectSuccess(res);
        expect(res.data.data.status).toBe("IN_REVIEW");
    });

    test('Approve campaign', async () => {
        const res = await http.post<{ success: boolean; data: any }>(
            `/campaigns/${campaignId}/approve`,
            {
                body: { note: "Looks good to me" },
                token: adminToken
            }
        );

        expectSuccess(res);
        expect(res.data.data.status).toBe("APPROVED");
        expect(res.data.data.approvals).toHaveLength(1);
        expect(res.data.data.approvals[0].note).toBe("Looks good to me");
    });

    test('Schedule approved campaign', async () => {
        const scheduleDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
        const res = await http.post<{ success: boolean; data: any }>(
            `/campaigns/${campaignId}/schedule`,
            {
                body: { scheduledAt: scheduleDate },
                token: adminToken
            }
        );

        expectSuccess(res);
        expect(res.data.data.status).toBe("SCHEDULED");
        expect(res.data.data.scheduledAt).toBe(scheduleDate);
    });

    test('Re-drafting scheduled campaign should reset approval', async () => {
        const res = await http.put<{ success: boolean; data: any }>(
            `/campaigns/${campaignId}`,
            {
                body: { status: "DRAFT" },
                token: adminToken
            }
        );

        expectSuccess(res);
        expect(res.data.data.status).toBe("DRAFT");
    });
});
