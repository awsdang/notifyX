/**
 * Users & Devices API Tests
 * Tests for user registration, device management, and deactivation
 * Includes both single and bulk request tests
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  http,
  factory,
  cleanup,
  login,
  testAdmins,
  expectSuccess,
  expectError,
  batchedRequests,
} from "./setup";

let adminToken: string;
let testAppId: string;
let appAdminToken: string;

beforeAll(async () => {
  const auth = await login(testAdmins.manager);
  if (auth) {
    adminToken = auth.token;
  }

  const superAuth = await login(testAdmins.superAdmin);
  if (superAuth) {
    appAdminToken = superAuth.token;
  }

  // Create a test app for user/device tests
  const appRes = await http.post<{ success: boolean; data: { id: string } }>(
    "/apps",
    { body: factory.app(), token: appAdminToken },
  );
  if (appRes.ok) {
    testAppId = appRes.data.data.id;
  }
});

afterAll(async () => {
  if (testAppId) {
    await http.post(`/apps/${testAppId}/kill`, {
      token: appAdminToken || adminToken,
    });
  }
  await cleanup.runAll(adminToken);
});

// ============================================================
// Single Request Tests - Users
// ============================================================

describe("Users API - Single Requests", () => {
  test("should register a new user", async () => {
    const userData = factory.user();
    const res = await http.post<{
      success: boolean;
      data: { id: string; externalUserId: string };
    }>("/users", { body: { ...userData, appId: testAppId } });

    expectSuccess(res);
    expect((res.data as any).error).toBe(false);
    expect(res.data.data.externalUserId).toBe(userData.externalUserId);

    cleanup.trackUser(res.data.data.id);
  });

  test("should get a user by ID", async () => {
    // Create user first
    const userData = factory.user();
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/users", { body: { ...userData, appId: testAppId } });
    expectSuccess(createRes);
    const userId = createRes.data.data.id;
    cleanup.trackUser(userId);

    // Get user
    const res = await http.get<{ success: boolean; data: { id: string } }>(
      `/users/${userId}`,
      { token: adminToken },
    );

    expectSuccess(res);
    expect(res.data.data.id).toBe(userId);
  });

  test("should list users with filters", async () => {
    const res = await http.get<{
      success: boolean;
      data: { users: Array<{ id: string }> };
    }>("/users", { token: adminToken });

    expectSuccess(res);
    expect(Array.isArray(res.data.data.users)).toBe(true);
  });

  test("should update a user nickname", async () => {
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/users", { body: { ...factory.user(), appId: testAppId } });
    expectSuccess(createRes);
    const userId = createRes.data.data.id;
    cleanup.trackUser(userId);

    const nickname = `vip_${Date.now()}`;
    const updateRes = await http.patch<{
      success: boolean;
      data: { id: string; nickname: string | null };
    }>(`/users/${userId}`, {
      token: adminToken,
      body: { nickname },
    });

    expectSuccess(updateRes);
    expect(updateRes.data.data.id).toBe(userId);
    expect(updateRes.data.data.nickname).toBe(nickname);
  });

  test("should delete a user", async () => {
    // Create user first
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/users", { body: { ...factory.user(), appId: testAppId } });
    expectSuccess(createRes);
    const userId = createRes.data.data.id;

    // Delete user
    const res = await http.delete<{ success: boolean }>(`/users/${userId}`, {
      token: adminToken,
    });

    expectSuccess(res);
    expect((res.data as any).error).toBe(false);

    // Verify deleted
    const getRes = await http.get(`/users/${userId}`, { token: adminToken });
    expectError(getRes, 404);
  });

  test("should return 404 for non-existent user", async () => {
    const res = await http.get("/users/non-existent-user-id", {
      token: adminToken,
    });
    expectError(res, 404);
  });
});

// ============================================================
// Single Request Tests - Devices
// ============================================================

describe("Devices API - Single Requests", () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user for device tests
    const userRes = await http.post<{ success: boolean; data: { id: string } }>(
      "/users",
      { body: { ...factory.user(), appId: testAppId } },
    );
    if (userRes.ok) {
      testUserId = userRes.data.data.id;
      cleanup.trackUser(testUserId);
    }
  });

  test("should register a device for a user", async () => {
    const deviceData = factory.device(testUserId, testAppId);
    const res = await http.post<{
      success: boolean;
      data: { id: string; platform: string };
    }>("/users/device", { body: deviceData });

    expectSuccess(res);
    expect((res.data as any).error).toBe(false);
    expect(res.data.data.platform).toBe(deviceData.platform);
  });

  test("should list all devices", async () => {
    const res = await http.get<{
      success: boolean;
      data: { devices: Array<{ id: string }> };
    }>("/devices", { token: adminToken });

    expectSuccess(res);
    expect(Array.isArray(res.data.data.devices)).toBe(true);
  });

  test("should deactivate a device", async () => {
    // Register a device first
    const deviceData = factory.device(testUserId, testAppId);
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/users/device", { body: deviceData });
    expectSuccess(createRes);
    const deviceId = createRes.data.data.id;

    // Deactivate device
    const res = await http.patch<{
      success: boolean;
      data: { isActive: boolean };
    }>(`/devices/${deviceId}/deactivate`, { token: adminToken });

    expectSuccess(res);
    expect(res.data.data.isActive).toBe(false);
  });

  test("should handle duplicate device token update", async () => {
    const pushToken = `duplicate_token_${Date.now()}`;

    // Register first device
    await http.post("/users/device", {
      body: factory.device(testUserId, testAppId, { pushToken }),
    });

    // Register same token again (should update, not create duplicate)
    const res = await http.post<{ success: boolean }>("/users/device", {
      body: factory.device(testUserId, testAppId, { pushToken }),
    });

    expectSuccess(res);
  });

  test("should register devices for multiple platforms", async () => {
    const platforms = ["web", "ios", "android"] as const;

    for (const platform of platforms) {
      const res = await http.post<{
        success: boolean;
        data: { platform: string };
      }>("/users/device", {
        body: factory.device(testUserId, testAppId, { platform }),
      });

      expectSuccess(res);
      expect(res.data.data.platform).toBe(platform);
    }
  });
});

// ============================================================
// Bulk Request Tests
// ============================================================

describe("Users API - Bulk Requests", () => {
  test("should register 50 users in parallel", async () => {
    const createRequests = Array.from(
      { length: 50 },
      () => () =>
        http.post<{ success: boolean; data: { id: string } }>("/users", {
          body: { ...factory.user(), appId: testAppId },
        }),
    );

    const results = await batchedRequests(createRequests, 10);

    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(50);

    // Track for cleanup
    for (const res of successful) {
      cleanup.trackUser(res.data.data.id);
    }
  });

  test("should register devices for multiple users in parallel", async () => {
    // Create 10 users
    const userIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await http.post<{ success: boolean; data: { id: string } }>(
        "/users",
        {
          body: { ...factory.user(), appId: testAppId },
        },
      );
      if (res.ok) {
        userIds.push(res.data.data.id);
        cleanup.trackUser(res.data.data.id);
      }
    }

    // Register devices for all users in parallel
    const deviceRequests = userIds.map(
      (userId) => () =>
        http.post<{ success: boolean }>("/users/device", {
          body: factory.device(userId, testAppId),
        }),
    );

    const results = await Promise.all(deviceRequests.map((fn) => fn()));
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(10);
  });

  test("should handle bulk device deactivation", async () => {
    // Create user with multiple devices
    const userRes = await http.post<{ success: boolean; data: { id: string } }>(
      "/users",
      {
        body: { ...factory.user(), appId: testAppId },
      },
    );
    expectSuccess(userRes);
    const userId = userRes.data.data.id;
    cleanup.trackUser(userId);

    // Register multiple devices
    const deviceIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await http.post<{ success: boolean; data: { id: string } }>(
        "/users/device",
        {
          body: factory.device(userId, testAppId),
        },
      );
      if (res.ok) {
        deviceIds.push(res.data.data.id);
      }
    }

    // Deactivate all devices in parallel
    const deactivateRequests = deviceIds.map(
      (id) => () =>
        http.patch<{ success: boolean }>(`/devices/${id}/deactivate`, {
          token: adminToken,
        }),
    );

    const results = await Promise.all(deactivateRequests.map((fn) => fn()));
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(5);
  });
});

// ============================================================
// Device Cleanup Scenario (from docs)
// ============================================================

describe("Device Cleanup - Safety Action Scenario", () => {
  test("should deactivate suspicious device with audit trail", async () => {
    // Create user
    const userRes = await http.post<{ success: boolean; data: { id: string } }>(
      "/users",
      {
        body: { ...factory.user(), appId: testAppId },
      },
    );
    expectSuccess(userRes);
    const userId = userRes.data.data.id;
    cleanup.trackUser(userId);

    // Register "suspicious" device
    const deviceRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/users/device", {
      body: factory.device(userId, testAppId, {
        pushToken: "suspicious_token_pattern_123",
      }),
    });
    expectSuccess(deviceRes);
    const deviceId = deviceRes.data.data.id;

    // Manager deactivates device
    const deactivateRes = await http.patch<{
      success: boolean;
      data: { isActive: boolean };
    }>(`/devices/${deviceId}/deactivate`, { token: adminToken });

    expectSuccess(deactivateRes);
    expect(deactivateRes.data.data.isActive).toBe(false);

    // Verify device is inactive (won't receive notifications)
    const devicesRes = await http.get<{
      success: boolean;
      data: { devices: Array<{ id: string; isActive: boolean }> };
    }>("/devices", { token: adminToken });

    expectSuccess(devicesRes);
    const device = devicesRes.data.data.devices.find((d) => d.id === deviceId);
    expect(device?.isActive).toBe(false);
  });
});
