/**
 * Apps API Tests
 * Tests for app management: create, read, update, kill/revive, webhooks
 * Includes both single and bulk request tests
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  http,
  factory,
  cleanup,
  login,
  testAdmins,
  TEST_API_KEY,
  expectSuccess,
  expectError,
  batchedRequests,
} from "./setup";

let adminToken: string;
const rawApiUrl = process.env.TEST_API_URL || "http://localhost:3000";
const API_URL = rawApiUrl.endsWith("/api/v1")
  ? rawApiUrl
  : `${rawApiUrl.replace(/\/$/, "")}/api/v1`;

beforeAll(async () => {
  const auth = await login(testAdmins.superAdmin);
  if (auth) {
    adminToken = auth.token;
  }
});

afterAll(async () => {
  await cleanup.runAll(adminToken);
});

// ============================================================
// Single Request Tests
// ============================================================

describe("Apps API - Single Requests", () => {
  test("should create a new app", async () => {
    const appData = factory.app();
    const res = await http.post<{
      error: boolean;
      data: { id: string; name: string };
    }>("/apps", { body: appData, token: adminToken });

    expectSuccess(res);
    expect((res.data as any).error).toBe(false);
    expect(res.data.data.name).toBe(appData.name);
    expect(res.data.data.id).toBeDefined();

    cleanup.trackApp(res.data.data.id);
  });

  test("should get an app by ID", async () => {
    // Create app first
    const appData = factory.app();
    const createRes = await http.post<{
      error: boolean;
      data: { id: string };
    }>("/apps", { body: appData, token: adminToken });
    expectSuccess(createRes);
    const appId = createRes.data.data.id;
    cleanup.trackApp(appId);

    // Get app
    const res = await http.get<{
      error: boolean;
      data: { id: string; name: string };
    }>(`/apps/${appId}`, { token: adminToken });

    expectSuccess(res);
    expect(res.data.data.id).toBe(appId);
    expect(res.data.data.name).toBe(appData.name);
  });

  test("should update an app", async () => {
    // Create app first
    const appData = factory.app();
    const createRes = await http.post<{
      error: boolean;
      data: { id: string };
    }>("/apps", { body: appData, token: adminToken });
    expectSuccess(createRes);
    const appId = createRes.data.data.id;
    cleanup.trackApp(appId);

    // Update app
    const newName = `Updated_${appData.name}`;
    const res = await http.put<{ error: boolean; data: { name: string } }>(
      `/apps/${appId}`,
      { body: { name: newName }, token: adminToken },
    );

    expectSuccess(res);
    expect(res.data.data.name).toBe(newName);
  });

  test("should upload and assign a notification icon to an app", async () => {
    const createRes = await http.post<{
      error: boolean;
      data: { id: string };
    }>("/apps", { body: factory.app(), token: adminToken });
    expectSuccess(createRes);
    const appId = createRes.data.data.id;
    cleanup.trackApp(appId);

    const formData = new FormData();
    formData.append(
      "file",
      new File([Buffer.from("fake-icon")], "icon.png", { type: "image/png" }),
    );
    formData.append("appId", appId);

    const uploadResponse = await fetch(`${API_URL}/assets/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "X-API-Key": TEST_API_KEY,
      },
      body: formData,
    });
    const uploadJson = (await uploadResponse.json()) as {
      data: { id: string; url: string };
    };

    expect(uploadResponse.ok).toBe(true);
    expect(uploadJson.data.id).toBeDefined();
    expect(uploadJson.data.url).toBeDefined();

    const updateRes = await http.put<{
      error: boolean;
      data: {
        notificationIconAssetId: string | null;
        notificationIconUrl: string | null;
        androidNotificationIcon: string | null;
      };
    }>(`/apps/${appId}`, {
      body: {
        notificationIconAssetId: uploadJson.data.id,
        androidNotificationIcon: "ic_stat_notifyx",
      },
      token: adminToken,
    });

    expectSuccess(updateRes);
    expect(updateRes.data.data.notificationIconAssetId).toBe(uploadJson.data.id);
    expect(updateRes.data.data.notificationIconUrl).toBe(uploadJson.data.url);
    expect(updateRes.data.data.androidNotificationIcon).toBe("ic_stat_notifyx");
  });

  test("should kill an app (Super Admin only)", async () => {
    // Create app first
    const createRes = await http.post<{
      error: boolean;
      data: { id: string };
    }>("/apps", { body: factory.app(), token: adminToken });
    expectSuccess(createRes);
    const appId = createRes.data.data.id;

    // Kill app
    const res = await http.post<{ error: boolean }>(`/apps/${appId}/kill`, {
      token: adminToken,
    });

    expectSuccess(res);
    expect((res.data as any).error).toBe(false);
  });

  test("should revive a killed app", async () => {
    // Create and kill app first
    const createRes = await http.post<{
      error: boolean;
      data: { id: string };
    }>("/apps", { body: factory.app(), token: adminToken });
    expectSuccess(createRes);
    const appId = createRes.data.data.id;

    await http.post(`/apps/${appId}/kill`, { token: adminToken });

    // Revive app
    const res = await http.post<{ error: boolean }>(`/apps/${appId}/revive`, {
      token: adminToken,
    });

    expectSuccess(res);
    expect((res.data as any).error).toBe(false);

    cleanup.trackApp(appId);
  });

  test("should return 404 for non-existent app", async () => {
    const res = await http.get("/apps/non-existent-id-12345", {
      token: adminToken,
    });
    expectError(res, 404);
  });

  test("should reject invalid app data", async () => {
    const res = await http.post("/apps", {
      body: { name: "" }, // Empty name should be invalid
      token: adminToken,
    });
    expectError(res, 400);
  });
});

// ============================================================
// Webhook Configuration Tests
// ============================================================

describe("Apps API - Webhook Configuration", () => {
  let testAppId: string;

  beforeAll(async () => {
    const createRes = await http.post<{
      error: boolean;
      data: { id: string };
    }>("/apps", { body: factory.app(), token: adminToken });
    if (createRes.ok) {
      testAppId = createRes.data.data.id;
      cleanup.trackApp(testAppId);
    }
  });

  test("should configure webhook URL", async () => {
    const res = await http.put<{
      error: boolean;
      data: { webhookUrl: string };
    }>(`/apps/${testAppId}/webhook`, {
      body: {
        webhookUrl: "https://example.com/webhook",
        webhookSecret: "a_very_secure_secret_key",
        webhookEnabled: true,
      },
      token: adminToken,
    });

    expectSuccess(res);
    expect(res.data.data.webhookUrl).toBe("https://example.com/webhook");
  });

  test("should test webhook endpoint", async () => {
    // Configure webhook first
    await http.put(`/apps/${testAppId}/webhook`, {
      body: {
        webhookUrl: "https://httpbin.org/post",
        webhookSecret: "test_secret_key_here",
        webhookEnabled: true,
      },
      token: adminToken,
    });

    const res = await http.post<{ error: boolean }>(
      `/apps/${testAppId}/webhook/test`,
      { token: adminToken },
    );

    // May fail if external service is down, but should return valid response
    expect(res.status).toBeLessThan(500);
  });

  test("should disable webhook", async () => {
    const res = await http.put<{
      error: boolean;
      data: { webhookEnabled: boolean };
    }>(`/apps/${testAppId}/webhook`, {
      body: { webhookEnabled: false },
      token: adminToken,
    });

    expectSuccess(res);
    expect(res.data.data.webhookEnabled).toBe(false);
  });

  test("should reject invalid webhook URL", async () => {
    const res = await http.put(`/apps/${testAppId}/webhook`, {
      body: { webhookUrl: "not-a-valid-url" },
      token: adminToken,
    });

    expectError(res, 400);
  });
});

// ============================================================
// Bulk Request Tests
// ============================================================

describe("Apps API - Bulk Requests", () => {
  test("should create 10 apps in parallel", async () => {
    const createRequests = Array.from(
      { length: 10 },
      () => () =>
        http.post<{ error: boolean; data: { id: string } }>("/apps", {
          body: factory.app(),
          token: adminToken,
        }),
    );

    const results = await batchedRequests(createRequests, 5);

    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(10);

    // Track for cleanup
    for (const res of successful) {
      cleanup.trackApp(res.data.data.id);
    }
  });

  test("should list all apps with pagination", async () => {
    // Create a few apps to ensure we have data
    for (let i = 0; i < 3; i++) {
      const createRes = await http.post<{
        error: boolean;
        data: { id: string };
      }>("/apps", { body: factory.app(), token: adminToken });
      if (createRes.ok) {
        cleanup.trackApp(createRes.data.data.id);
      }
    }

    const res = await http.get<{
      error: boolean;
      data: Array<{ id: string }>;
    }>("/apps", { token: adminToken });

    expectSuccess(res);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);
  });

  test("should handle concurrent app updates", async () => {
    // Create an app first
    const createRes = await http.post<{
      error: boolean;
      data: { id: string };
    }>("/apps", { body: factory.app(), token: adminToken });
    expectSuccess(createRes);
    const appId = createRes.data.data.id;
    cleanup.trackApp(appId);

    // Concurrent updates (last write wins)
    const updateRequests = Array.from(
      { length: 5 },
      (_, i) => () =>
        http.put(`/apps/${appId}`, {
          body: { name: `ConcurrentUpdate_${i}` },
          token: adminToken,
        }),
    );

    const results = await Promise.all(updateRequests.map((fn) => fn()));
    const successful = results.filter((r) => r.ok);

    // All should succeed (last write wins)
    expect(successful.length).toBe(5);
  });
});
