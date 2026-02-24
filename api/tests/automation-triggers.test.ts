import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  cleanup,
  expectError,
  expectSuccess,
  factory,
  http,
  login,
  testAdmins,
} from "./setup";

let adminToken: string;
let marketingToken: string;
let testAppId: string;
let triggerId: string;
let triggerEventName: string;
let automationId: string;

beforeAll(async () => {
  const adminAuth = await login(testAdmins.superAdmin);
  if (adminAuth) {
    adminToken = adminAuth.token;
  }

  const marketingAuth = await login(testAdmins.marketing);
  if (marketingAuth) {
    marketingToken = marketingAuth.token;
  }

  const appData = factory.app();
  const appRes = await http.post<{ error: boolean; data: { id: string } }>(
    "/apps",
    {
      body: appData,
      token: adminToken,
    },
  );

  if (appRes.ok) {
    testAppId = appRes.data.data.id;
    cleanup.trackApp(testAppId);
  }
});

afterAll(async () => {
  await cleanup.runAll(adminToken);
});

describe("Automation Trigger API", () => {
  test("Should create trigger", async () => {
    const res = await http.post<{
      error: boolean;
      data: { id: string; eventName: string; appId: string };
    }>("/automation-triggers", {
      body: {
        appId: testAppId,
        name: "Order Completed",
        eventName: "order_completed",
        description: "Raised when payment is confirmed",
        conditionFields: ["payload.total", "payload.currency"],
        payloadExample: {
          total: 129.99,
          currency: "USD",
          orderId: "A123",
        },
      },
      token: marketingToken,
    });

    expectSuccess(res);
    expect(res.data.data.appId).toBe(testAppId);
    triggerId = res.data.data.id;
    triggerEventName = res.data.data.eventName;
  });

  test("Should list triggers for app", async () => {
    const res = await http.get<{
      error: boolean;
      data: Array<{ id: string }>;
    }>(`/automation-triggers?appId=${testAppId}&includeInactive=true`, {
      token: marketingToken,
    });

    expectSuccess(res);
    expect(res.data.data.some((trigger) => trigger.id === triggerId)).toBe(true);
  });

  test("Should update trigger", async () => {
    const res = await http.put<{
      error: boolean;
      data: { eventName: string; conditionFields: string[] };
    }>(`/automation-triggers/${triggerId}`, {
      body: {
        name: "Order Completed + Paid",
        eventName: "order_paid",
        conditionFields: ["payload.total", "payload.currency", "payload.country"],
      },
      token: marketingToken,
    });

    expectSuccess(res);
    expect(res.data.data.eventName).toBe("order_paid");
    expect(res.data.data.conditionFields.length).toBe(3);
    triggerEventName = res.data.data.eventName;
  });

  test("Should create workflow bound to trigger", async () => {
    const res = await http.post<{
      error: boolean;
      data: { id: string; trigger: string };
    }>("/automations", {
      body: {
        appId: testAppId,
        name: "Paid order follow-up",
        trigger: triggerEventName,
        isActive: true,
        steps: [{ id: "delay-1", type: "delay", config: { waitMinutes: 1 } }],
      },
      token: marketingToken,
    });

    expectSuccess(res);
    automationId = res.data.data.id;
    expect(res.data.data.trigger).toBe(triggerEventName);
  });

  test("Should test trigger and return execution counts", async () => {
    const res = await http.post<{
      error: boolean;
      data: {
        triggerId: string;
        eventName: string;
        matchedAutomations: number;
        spawnedExecutions: number;
      };
    }>(`/automation-triggers/${triggerId}/test`, {
      body: {
        externalUserId: "demo-user-123",
        payload: {
          total: 100,
          currency: "USD",
        },
      },
      token: marketingToken,
    });

    expectSuccess(res);
    expect(res.data.data.triggerId).toBe(triggerId);
    expect(res.data.data.eventName).toBe(triggerEventName);
    expect(res.data.data.matchedAutomations).toBeGreaterThanOrEqual(1);
    expect(res.data.data.spawnedExecutions).toBeGreaterThanOrEqual(1);
  });

  test("Should block deleting trigger while in use", async () => {
    const res = await http.delete(`/automation-triggers/${triggerId}`, {
      token: marketingToken,
    });
    expectError(res, 409);
  });

  test("Should delete trigger after workflow is removed", async () => {
    const deleteWorkflow = await http.delete(`/automations/${automationId}`, {
      token: marketingToken,
    });
    expectSuccess(deleteWorkflow);

    const deleteTrigger = await http.delete(`/automation-triggers/${triggerId}`, {
      token: marketingToken,
    });
    expectSuccess(deleteTrigger);
  });
});
