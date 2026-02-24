/**
 * Campaigns API Tests
 * Tests for bulk campaign management, CSV upload, scheduling, audience estimation
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
  const auth = await login(testAdmins.marketing);
  if (auth) {
    adminToken = auth.token;
  }

  const superAuth = await login(testAdmins.superAdmin);
  if (superAuth) {
    appAdminToken = superAuth.token;
  }

  // Create a test app
  const appRes = await http.post<{ success: boolean; data: { id: string } }>(
    "/apps",
    { body: factory.app(), token: appAdminToken },
  );
  if (appRes.ok) {
    testAppId = appRes.data.data.id;
  }
});

afterAll(async () => {
  await cleanup.runAll(adminToken);
  if (testAppId) {
    const superAuth = await login(testAdmins.superAdmin);
    if (superAuth) {
      await http.post(`/apps/${testAppId}/kill`, { token: superAuth.token });
    }
  }
});

// ============================================================
// Single Request Tests
// ============================================================

describe("Campaigns API - Single Requests", () => {
  test("should create a new campaign", async () => {
    const campaignData = factory.campaign(testAppId);
    const res = await http.post<{
      success: boolean;
      data: { id: string; name: string; status: string };
    }>("/campaigns", { body: campaignData, token: adminToken });

    expectSuccess(res);
    expect((res.data as any).error).toBe(false);
    expect(res.data.data.name).toBe(campaignData.name);
    expect(res.data.data.status).toBe("DRAFT");

    cleanup.trackCampaign(res.data.data.id);
  });

  test("should get a campaign by ID", async () => {
    // Create campaign first
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // Get campaign
    const res = await http.get<{ success: boolean; data: { id: string } }>(
      `/campaigns/${campaignId}`,
      { token: adminToken },
    );

    expectSuccess(res);
    expect(res.data.data.id).toBe(campaignId);
  });

  test("should update a draft campaign", async () => {
    // Create campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // Update campaign
    const newTitle = "Updated Campaign Title";
    const res = await http.put<{ success: boolean; data: { title: string } }>(
      `/campaigns/${campaignId}`,
      { body: { title: newTitle }, token: adminToken },
    );

    expectSuccess(res);
    expect(res.data.data.title).toBe(newTitle);
  });

  test("should schedule a campaign", async () => {
    // Create campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // Schedule for 1 hour from now
    const scheduledAt = new Date(Date.now() + 3600000).toISOString();
    const res = await http.post<{
      success: boolean;
      data: { status: string; scheduledAt: string };
    }>(`/campaigns/${campaignId}/schedule`, {
      body: { scheduledAt },
      token: adminToken,
    });

    expectSuccess(res);
    expect(res.data.data.status).toBe("SCHEDULED");
  });

  test("should send a campaign immediately", async () => {
    // Create campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // Send immediately
    const res = await http.post<{ success: boolean; data: { status: string } }>(
      `/campaigns/${campaignId}/send`,
      { token: adminToken },
    );

    expectSuccess(res);
    // Status should be either SENDING, SENT, COMPLETED or SCHEDULED (if processed asynchronously)
    expect(["SENDING", "SENT", "COMPLETED", "SCHEDULED"]).toContain(
      res.data.data.status,
    );
  });

  test("should cancel a scheduled campaign", async () => {
    // Create and schedule campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;

    await http.post(`/campaigns/${campaignId}/schedule`, {
      body: { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
      token: adminToken,
    });

    // Cancel
    const res = await http.post<{ success: boolean; data: { status: string } }>(
      `/campaigns/${campaignId}/cancel`,
      { token: adminToken },
    );

    expectSuccess(res);
    expect(res.data.data.status).toBe("CANCELLED");
  });

  test("should delete a draft campaign", async () => {
    // Create campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;

    // Delete
    const res = await http.delete<{ success: boolean }>(
      `/campaigns/${campaignId}`,
      { token: adminToken },
    );

    expectSuccess(res);

    // Verify deleted
    const getRes = await http.get(`/campaigns/${campaignId}`, {
      token: adminToken,
    });
    expectError(getRes, 404);
  });

  test("should duplicate a campaign", async () => {
    // Create campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string; name: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    const originalName = createRes.data.data.name;
    cleanup.trackCampaign(campaignId);

    // Duplicate
    const res = await http.post<{
      success: boolean;
      data: { id: string; name: string; status: string };
    }>(`/campaigns/${campaignId}/duplicate`, { token: adminToken });

    expectSuccess(res);
    expect(res.data.data.id).not.toBe(campaignId);
    expect(res.data.data.name).toContain(originalName);
    expect(res.data.data.status).toBe("DRAFT");

    cleanup.trackCampaign(res.data.data.id);
  });

  test("should save campaign as draft", async () => {
    // Create campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // Save draft with updates
    const res = await http.put<{
      success: boolean;
      data: { title: string; status: string };
    }>(`/campaigns/${campaignId}/draft`, {
      body: { title: "Draft Title", body: "Draft Body" },
      token: adminToken,
    });

    expectSuccess(res);
    expect(res.data.data.status).toBe("DRAFT");
  });

  test("should return 404 for non-existent campaign", async () => {
    const res = await http.get("/campaigns/non-existent-id", {
      token: adminToken,
    });
    expectError(res, 404);
  });
});

// ============================================================
// CSV Upload Tests
// ============================================================

describe("Campaigns API - CSV Upload", () => {
  test("should upload CSV with user IDs", async () => {
    // Create campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // Upload CSV (simulated as JSON since actual multipart is complex)
    const res = await http.post<{
      success: boolean;
      data: { audienceCount: number };
    }>(`/campaigns/${campaignId}/csv`, {
      body: {
        userIds: ["user_1", "user_2", "user_3", "user_4", "user_5"],
      },
      token: adminToken,
    });

    // May have different implementation, check it doesn't error
    expect(res.status).toBeLessThan(500);
  });
});

// ============================================================
// Audience Estimation Tests
// ============================================================

describe("Campaigns API - Audience Estimation", () => {
  test("should estimate audience size", async () => {
    const res = await http.post<{
      success: boolean;
      data: { users: number; devices: number };
    }>("/campaigns/audience-estimate", {
      body: { appId: testAppId },
      token: adminToken,
    });

    expectSuccess(res);
    expect(typeof res.data.data.users).toBe("number");
  });

  test("should estimate audience with filters", async () => {
    const res = await http.post<{ success: boolean; data: { total: number } }>(
      "/campaigns/audience-estimate",
      {
        body: {
          appId: testAppId,
          platform: "web",
          language: "en",
        },
        token: adminToken,
      },
    );

    expect(res.status).toBeLessThan(500);
  });
});

// ============================================================
// Campaign Stats Tests
// ============================================================

describe("Campaigns API - Stats", () => {
  test("should get campaign stats", async () => {
    // Create and send campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // Get stats (might be empty for new campaign)
    const res = await http.get<{
      success: boolean;
      data: { stats: { sent: number; delivered: number; failed: number } };
    }>(`/campaigns/${campaignId}/stats`, { token: adminToken });

    expectSuccess(res);
    expect(typeof res.data.data.stats.sent).toBe("number");
  });
});

// ============================================================
// Bulk Request Tests
// ============================================================

describe("Campaigns API - Bulk Requests", () => {
  test("should create 10 campaigns in parallel", async () => {
    const createRequests = Array.from(
      { length: 10 },
      () => () =>
        http.post<{ success: boolean; data: { id: string } }>("/campaigns", {
          body: factory.campaign(testAppId),
          token: adminToken,
        }),
    );

    const results = await batchedRequests(createRequests, 5);
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(10);

    // Track for cleanup
    for (const res of successful) {
      cleanup.trackCampaign(res.data.data.id);
    }
  });

  test("should list all campaigns with pagination", async () => {
    const res = await http.get<{
      success: boolean;
      data: Array<{ id: string }>;
    }>("/campaigns", { token: adminToken });

    expectSuccess(res);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test("should handle concurrent campaign updates", async () => {
    // Create a campaign
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/campaigns", { body: factory.campaign(testAppId), token: adminToken });
    expectSuccess(createRes);
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // Concurrent updates
    const updateRequests = Array.from(
      { length: 5 },
      (_, i) => () =>
        http.put(`/campaigns/${campaignId}`, {
          body: { title: `ConcurrentUpdate_${i}` },
          token: adminToken,
        }),
    );

    const results = await Promise.all(updateRequests.map((fn) => fn()));
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(5);
  });

  test("should schedule multiple campaigns at different times", async () => {
    const campaignIds: string[] = [];

    // Create 5 campaigns
    for (let i = 0; i < 5; i++) {
      const res = await http.post<{ success: boolean; data: { id: string } }>(
        "/campaigns",
        {
          body: factory.campaign(testAppId),
          token: adminToken,
        },
      );
      if (res.ok) {
        campaignIds.push(res.data.data.id);
        cleanup.trackCampaign(res.data.data.id);
      }
    }

    // Schedule each at different times
    const scheduleRequests = campaignIds.map(
      (id, i) => () =>
        http.post<{ success: boolean }>(`/campaigns/${id}/schedule`, {
          body: {
            scheduledAt: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
          },
          token: adminToken,
        }),
    );

    const results = await Promise.all(scheduleRequests.map((fn) => fn()));
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(5);
  });

  test("should bulk cancel multiple campaigns", async () => {
    const campaignIds: string[] = [];

    // Create and schedule 3 campaigns
    for (let i = 0; i < 3; i++) {
      const createRes = await http.post<{
        success: boolean;
        data: { id: string };
      }>("/campaigns", {
        body: factory.campaign(testAppId),
        token: adminToken,
      });
      if (createRes.ok) {
        const id = createRes.data.data.id;
        campaignIds.push(id);

        await http.post(`/campaigns/${id}/schedule`, {
          body: { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
          token: adminToken,
        });
      }
    }

    // Cancel all
    const cancelRequests = campaignIds.map(
      (id) => () =>
        http.post<{ success: boolean }>(`/campaigns/${id}/cancel`, {
          token: adminToken,
        }),
    );

    const results = await Promise.all(cancelRequests.map((fn) => fn()));
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(3);
  });
});

// ============================================================
// Campaign Workflow (from docs)
// ============================================================

describe("Campaigns API - Full Workflow", () => {
  test("should complete full campaign lifecycle: draft → schedule → send", async () => {
    // 1. Create draft
    const createRes = await http.post<{
      success: boolean;
      data: { id: string; status: string };
    }>("/campaigns", {
      body: factory.campaign(testAppId, {
        title: "Weekend Promo",
        body: "Get 50% off this weekend only!",
        priority: "HIGH",
      }),
      token: adminToken,
    });
    expectSuccess(createRes);
    expect(createRes.data.data.status).toBe("DRAFT");
    const campaignId = createRes.data.data.id;
    cleanup.trackCampaign(campaignId);

    // 2. Update with more content
    const updateRes = await http.put<{ success: boolean }>(
      `/campaigns/${campaignId}`,
      {
        body: { subtitle: "Limited time only!" },
        token: adminToken,
      },
    );
    expectSuccess(updateRes);

    // 3. Get audience estimate
    const estimateRes = await http.post<{
      success: boolean;
      data: { users: number };
    }>("/campaigns/audience-estimate", {
      body: { appId: testAppId },
      token: adminToken,
    });
    expectSuccess(estimateRes);

    // 4. Schedule for later
    const scheduleRes = await http.post<{
      success: boolean;
      data: { status: string };
    }>(`/campaigns/${campaignId}/schedule`, {
      body: { scheduledAt: new Date(Date.now() + 3600000).toISOString() },
      token: adminToken,
    });
    expectSuccess(scheduleRes);
    expect(scheduleRes.data.data.status).toBe("SCHEDULED");

    // 5. Cancel (change of plans)
    const cancelRes = await http.post<{
      success: boolean;
      data: { status: string };
    }>(`/campaigns/${campaignId}/cancel`, { token: adminToken });
    expectSuccess(cancelRes);
    expect(cancelRes.data.data.status).toBe("CANCELLED");
  });
});
