import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
    http,
    factory,
    cleanup,
    login,
    testAdmins,
    expectSuccess,
    expectError,
} from "./setup";

let adminToken: string;
let marketingToken: string;
let testAppId: string;
let automationId: string;
let triggerEventName: string;

beforeAll(async () => {
    const auth = await login(testAdmins.superAdmin);
    if (auth) {
        adminToken = auth.token;
    }
    const marketingAuth = await login(testAdmins.marketing);
    if (marketingAuth) {
        marketingToken = marketingAuth.token;
    }

    // Create an app for automations using superAdmin
    const appData = factory.app();
    const createRes = await http.post<{
        error: boolean;
        data: { id: string };
    }>("/apps", { body: appData, token: adminToken });

    if (createRes.ok) {
        testAppId = createRes.data.data.id;
        cleanup.trackApp(testAppId);
    }
});

afterAll(async () => {
    await cleanup.runAll(adminToken);
});

describe("Automation API", () => {
    test("Should create an automation trigger definition", async () => {
        const res = await http.post<{
            error: boolean;
            data: { id: string; eventName: string };
        }>("/automation-triggers", {
            body: {
                appId: testAppId,
                name: "User Registered",
                eventName: "user_registered",
                description: "Fires when a user signs up",
                conditionFields: ["payload.plan", "externalUserId"]
            },
            token: marketingToken
        });

        expectSuccess(res);
        triggerEventName = res.data.data.eventName;
    });

    test("Should create an automation", async () => {
        const res = await http.post<{
            error: boolean;
            data: { id: string; name: string };
        }>("/automations", {
            body: {
                appId: testAppId,
                name: "Welcome Automation",
                trigger: triggerEventName,
                isActive: false,
                steps: [
                    {
                        id: "s1",
                        type: "condition",
                        label: "Check plan",
                        config: {
                            triggerEvent: triggerEventName,
                            field: "payload.plan",
                            operator: "equals",
                            value: "pro",
                            onTrue: "continue",
                            onFalse: "continue",
                        },
                    },
                    { id: "s2", type: "delay", label: "Wait 1 hr", config: { waitHours: 1 } },
                    {
                        id: "s3",
                        type: "notification",
                        label: "Send Notification",
                        config: { title: "Welcome", body: "Thanks for joining" }
                    }
                ]
            },
            token: marketingToken
        });

        expectSuccess(res);
        expect((res.data as any).error).toBe(false);
        expect(res.data.data.id).toBeDefined();
        expect(res.data.data.name).toBe("Welcome Automation");
        automationId = res.data.data.id;
    });

    test("Should list automations", async () => {
        const res = await http.get<{
            error: boolean;
            data: Array<{ id: string }>;
        }>(`/automations?appId=${testAppId}`, { token: marketingToken });

        expectSuccess(res);
        expect(res.data.data.length).toBeGreaterThan(0);
        // expect(res.data.data[0].id).toBe(automationId);
    });

    test("Should get a specific automation", async () => {
        const res = await http.get<{
            error: boolean;
            data: { id: string; trigger: string };
        }>(`/automations/${automationId}`, { token: marketingToken });

        expectSuccess(res);
        expect(res.data.data.id).toBe(automationId);
        expect(res.data.data.trigger).toBe(triggerEventName);
    });

    test("Should block activation before publish", async () => {
        const res = await http.post(`/automations/${automationId}/toggle`, {
            token: marketingToken,
        });
        expectError(res, 409);
    });

    test("Should publish automation draft", async () => {
        const res = await http.post<{
            error: boolean;
            data: { publishedVersion: number | null; hasUnpublishedChanges: boolean };
        }>(`/automations/${automationId}/publish`, { token: marketingToken });

        expectSuccess(res);
        expect(res.data.data.publishedVersion).toBeGreaterThanOrEqual(1);
        expect(res.data.data.hasUnpublishedChanges).toBe(false);
    });

    test("Should toggle automation status", async () => {
        const res = await http.post<{
            error: boolean;
            data: { isActive: boolean };
        }>(`/automations/${automationId}/toggle`, { token: marketingToken });

        expectSuccess(res);
        expect(res.data.data.isActive).toBe(true);
    });

    test("Should simulate published automation with step trace", async () => {
        const res = await http.post<{
            error: boolean;
            data: {
                status: string;
                trace: Array<{ stepType: string; nextStepIndex: number | null }>;
            };
        }>(`/automations/${automationId}/simulate`, {
            body: {
                usePublished: true,
                externalUserId: "demo-user-123",
                payload: {
                    plan: "pro",
                },
            },
            token: marketingToken,
        });

        expectSuccess(res);
        expect(res.data.data.status).toBe("COMPLETED");
        expect(Array.isArray(res.data.data.trace)).toBe(true);
        expect(res.data.data.trace.length).toBeGreaterThanOrEqual(2);
        expect(res.data.data.trace[0]?.stepType).toBe("condition");
    });

    test("Should update automation", async () => {
        const res = await http.put<{
            error: boolean;
            data: { name: string; trigger: string };
        }>(`/automations/${automationId}`, {
            body: {
                name: "Updated Automation Name",
                trigger: triggerEventName,
            },
            token: marketingToken
        });

        expectSuccess(res);
        expect(res.data.data.name).toBe("Updated Automation Name");
        expect(res.data.data.trigger).toBe(triggerEventName);
    });

    test("Should reject unknown automation trigger", async () => {
        const res = await http.post("/automations", {
            body: {
                appId: testAppId,
                name: "Broken Workflow",
                trigger: "unknown_trigger",
                isActive: false,
                steps: [],
            },
            token: marketingToken
        });

        expectError(res, 400);
    });

    test("Should unlist on deleted automation", async () => {
        const res = await http.delete(`/automations/${automationId}`, { token: marketingToken });
        expectSuccess(res);

        const checkRes = await http.get(`/automations/${automationId}`, { token: marketingToken });
        expectError(checkRes, 404);
    });
});
