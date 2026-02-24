/**
 * A/B Tests API Tests
 * Tests for A/B test creation, variants, starting, results, and winner selection
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

describe("A/B Tests API - Single Requests", () => {
  test("should create a new A/B test", async () => {
    const abTestData = factory.abTest(testAppId);
    const res = await http.post<{
      success: boolean;
      data: { id: string; name: string; status: string };
    }>("/ab-tests", { body: abTestData, token: adminToken });

    expectSuccess(res);
    expect((res.data as any).error).toBe(false);
    expect(res.data.data.name).toBe(abTestData.name);
    expect(res.data.data.status).toBe("DRAFT");

    cleanup.trackABTest(res.data.data.id);
  });

  test("should get an A/B test by ID", async () => {
    // Create A/B test first
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;
    cleanup.trackABTest(abTestId);

    // Get A/B test
    const res = await http.get<{
      success: boolean;
      data: { id: string; variants: Array<unknown> };
    }>(`/ab-tests/${abTestId}`, { token: adminToken });

    expectSuccess(res);
    expect(res.data.data.id).toBe(abTestId);
    expect(Array.isArray(res.data.data.variants)).toBe(true);
  });

  test("should update an A/B test", async () => {
    // Create A/B test
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;
    cleanup.trackABTest(abTestId);

    // Update
    const newName = "Updated A/B Test Name";
    const res = await http.put<{ success: boolean; data: { name: string } }>(
      `/ab-tests/${abTestId}`,
      { body: { name: newName }, token: adminToken },
    );

    expectSuccess(res);
    expect(res.data.data.name).toBe(newName);
  });

  test("should start an A/B test", async () => {
    // Create A/B test
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;
    cleanup.trackABTest(abTestId);

    // Start
    const res = await http.post<{ success: boolean; data: { status: string } }>(
      `/ab-tests/${abTestId}/start`,
      { token: adminToken },
    );

    expectSuccess(res);
    expect(res.data.data.status).toBe("ACTIVE");
  });

  test("should cancel a running A/B test", async () => {
    // Create and start A/B test
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;
    cleanup.trackABTest(abTestId);

    await http.post(`/ab-tests/${abTestId}/start`, { token: adminToken });

    // Cancel
    const res = await http.post<{ success: boolean; data: { status: string } }>(
      `/ab-tests/${abTestId}/cancel`,
      { token: adminToken },
    );

    expectSuccess(res);
    expect(res.data.data.status).toBe("CANCELLED");
  });

  test("should duplicate an A/B test", async () => {
    // Create A/B test
    const createRes = await http.post<{
      success: boolean;
      data: { id: string; name: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;
    const originalName = createRes.data.data.name;
    cleanup.trackABTest(abTestId);

    // Duplicate
    const res = await http.post<{
      success: boolean;
      data: { id: string; name: string; status: string };
    }>(`/ab-tests/${abTestId}/duplicate`, { token: adminToken });

    expectSuccess(res);
    expect(res.data.data.id).not.toBe(abTestId);
    expect(res.data.data.status).toBe("DRAFT");

    cleanup.trackABTest(res.data.data.id);
  });

  test("should delete a draft A/B test", async () => {
    // Create A/B test
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;

    // Delete
    const res = await http.delete<{ success: boolean }>(
      `/ab-tests/${abTestId}`,
      { token: adminToken },
    );

    expectSuccess(res);

    // Verify deleted
    const getRes = await http.get(`/ab-tests/${abTestId}`, {
      token: adminToken,
    });
    expectError(getRes, 404);
  });

  test("should save A/B test as draft", async () => {
    // Create A/B test
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;
    cleanup.trackABTest(abTestId);

    // Save draft
    const res = await http.put<{
      success: boolean;
      data: { name: string; status: string };
    }>(`/ab-tests/${abTestId}/draft`, {
      body: { name: "Draft A/B Test" },
      token: adminToken,
    });

    expectSuccess(res);
    expect(res.data.data.status).toBe("DRAFT");
  });

  test("should return 404 for non-existent A/B test", async () => {
    const res = await http.get("/ab-tests/non-existent-id", {
      token: adminToken,
    });
    expectError(res, 404);
  });
});

// ============================================================
// A/B Test Results
// ============================================================

describe("A/B Tests API - Results", () => {
  test("should get A/B test results", async () => {
    // Create and start A/B test
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;
    cleanup.trackABTest(abTestId);

    await http.post(`/ab-tests/${abTestId}/start`, { token: adminToken });

    // Get results (might be empty for new test)
    const res = await http.get<{
      success: boolean;
      data: { results: Array<{ stats: { sent: number } }> };
    }>(`/ab-tests/${abTestId}/results`, { token: adminToken });

    expectSuccess(res);
    expect(Array.isArray(res.data.data.results)).toBe(true);
  });
});

// ============================================================
// Variant Configuration Tests
// ============================================================

describe("A/B Tests API - Variants", () => {
  test("should create A/B test with two variants (50/50 split)", async () => {
    const abTestData = factory.abTest(testAppId, {
      variants: [
        {
          name: "Control",
          title: "Original Title",
          body: "Original Body",
          weight: 50,
        },
        { name: "Variant A", title: "New Title", body: "New Body", weight: 50 },
      ],
    });

    const res = await http.post<{
      success: boolean;
      data: { id: string; variants: Array<{ weight: number }> };
    }>("/ab-tests", { body: abTestData, token: adminToken });

    expectSuccess(res);
    expect(res.data.data.variants.length).toBe(2);
    cleanup.trackABTest(res.data.data.id);
  });

  test("should create A/B test with three variants", async () => {
    const abTestData = factory.abTest(testAppId, {
      variants: [
        {
          name: "Control",
          title: "Control Title",
          body: "Control Body",
          weight: 34,
        },
        {
          name: "Variant A",
          title: "Variant A Title",
          body: "Variant A Body",
          weight: 33,
        },
        {
          name: "Variant B",
          title: "Variant B Title",
          body: "Variant B Body",
          weight: 33,
        },
      ],
    });

    const res = await http.post<{
      success: boolean;
      data: { id: string; variants: Array<{ name: string }> };
    }>("/ab-tests", { body: abTestData, token: adminToken });

    expectSuccess(res);
    expect(res.data.data.variants.length).toBe(3);
    cleanup.trackABTest(res.data.data.id);
  });

  test("should create A/B test with 10/90 split (small test, large rollout)", async () => {
    const abTestData = factory.abTest(testAppId, {
      variants: [
        { name: "Test", title: "Test Title", body: "Test Body", weight: 10 },
        {
          name: "Winner",
          title: "Winner Title",
          body: "Winner Body",
          weight: 90,
        },
      ],
    });

    const res = await http.post<{ success: boolean; data: { id: string } }>(
      "/ab-tests",
      { body: abTestData, token: adminToken },
    );

    expectSuccess(res);
    cleanup.trackABTest(res.data.data.id);
  });
});

// ============================================================
// Bulk Request Tests
// ============================================================

describe("A/B Tests API - Bulk Requests", () => {
  test("should create 5 A/B tests in parallel", async () => {
    const createRequests = Array.from(
      { length: 5 },
      () => () =>
        http.post<{ success: boolean; data: { id: string } }>("/ab-tests", {
          body: factory.abTest(testAppId),
          token: adminToken,
        }),
    );

    const results = await batchedRequests(createRequests, 3);
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(5);

    // Track for cleanup
    for (const res of successful) {
      cleanup.trackABTest(res.data.data.id);
    }
  });

  test("should list all A/B tests", async () => {
    const res = await http.get<{
      success: boolean;
      data: Array<{ id: string }>;
    }>("/ab-tests", { token: adminToken });

    expectSuccess(res);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test("should start multiple A/B tests in parallel", async () => {
    // Create 3 A/B tests
    const abTestIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await http.post<{ success: boolean; data: { id: string } }>(
        "/ab-tests",
        {
          body: factory.abTest(testAppId),
          token: adminToken,
        },
      );
      if (res.ok) {
        abTestIds.push(res.data.data.id);
        cleanup.trackABTest(res.data.data.id);
      }
    }

    // Start all in parallel
    const startRequests = abTestIds.map(
      (id) => () =>
        http.post<{ success: boolean }>(`/ab-tests/${id}/start`, {
          token: adminToken,
        }),
    );

    const results = await Promise.all(startRequests.map((fn) => fn()));
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(3);
  });

  test("should handle concurrent A/B test updates", async () => {
    // Create an A/B test
    const createRes = await http.post<{
      success: boolean;
      data: { id: string };
    }>("/ab-tests", { body: factory.abTest(testAppId), token: adminToken });
    expectSuccess(createRes);
    const abTestId = createRes.data.data.id;
    cleanup.trackABTest(abTestId);

    // Concurrent updates
    const updateRequests = Array.from(
      { length: 5 },
      (_, i) => () =>
        http.put(`/ab-tests/${abTestId}`, {
          body: { name: `ConcurrentUpdate_${i}` },
          token: adminToken,
        }),
    );

    const results = await Promise.all(updateRequests.map((fn) => fn()));
    const successful = results.filter((r) => r.ok);
    expect(successful.length).toBe(5);
  });
});

// ============================================================
// A/B Test Workflow (from docs)
// ============================================================

describe("A/B Tests API - Full Workflow", () => {
  test("should complete A/B test lifecycle: create → start → get results → cancel", async () => {
    // 1. Create A/B test with two variants
    const createRes = await http.post<{
      success: boolean;
      data: { id: string; status: string };
    }>("/ab-tests", {
      body: factory.abTest(testAppId, {
        name: "Weekend Promo A/B Test",
        variants: [
          {
            name: "Control",
            title: "50% Off!",
            body: "Get 50% off this weekend",
            weight: 50,
          },
          {
            name: "Urgency",
            title: "Ending in 2 hours!",
            body: "Sale ends soon",
            weight: 50,
          },
        ],
      }),
      token: adminToken,
    });
    expectSuccess(createRes);
    expect(createRes.data.data.status).toBe("DRAFT");
    const abTestId = createRes.data.data.id;
    cleanup.trackABTest(abTestId);

    // 2. Start the test
    const startRes = await http.post<{
      success: boolean;
      data: { status: string };
    }>(`/ab-tests/${abTestId}/start`, { token: adminToken });
    expectSuccess(startRes);
    expect(startRes.data.data.status).toBe("ACTIVE");

    // 3. Get results (even if empty)
    const resultsRes = await http.get<{
      success: boolean;
      data: { results: Array<unknown> };
    }>(`/ab-tests/${abTestId}/results`, { token: adminToken });
    expectSuccess(resultsRes);
    expect(Array.isArray(resultsRes.data.data.results)).toBe(true);

    // 4. Cancel the test
    const cancelRes = await http.post<{
      success: boolean;
      data: { status: string };
    }>(`/ab-tests/${abTestId}/cancel`, { token: adminToken });
    expectSuccess(cancelRes);
    expect(cancelRes.data.data.status).toBe("CANCELLED");
  });
});
