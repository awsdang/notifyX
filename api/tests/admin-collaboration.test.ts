import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cleanup, expectSuccess, factory, http, login, testAdmins } from "./setup";

let superToken: string;

beforeAll(async () => {
  const auth = await login(testAdmins.superAdmin);
  if (!auth) {
    throw new Error("Failed to login as super admin for collaboration tests");
  }
  superToken = auth.token;
});

afterAll(async () => {
  await cleanup.runAll(superToken);
});

describe("Admin Collaboration", () => {
  test("invited user gets app access after signup", async () => {
    const createAppRes = await http.post<{ error: boolean; data: { id: string } }>(
      "/apps",
      { body: factory.app(), token: superToken },
    );
    expectSuccess(createAppRes);
    const appId = createAppRes.data.data.id;
    cleanup.trackApp(appId);

    const unique = Date.now();
    const inviteEmail = `invite_${unique}@test.local`;
    const password = "TestPassword123!";

    const inviteRes = await http.post<{ error: boolean; data: { kind: string } }>(
      `/apps/${appId}/invites`,
      {
        token: superToken,
        body: {
          email: inviteEmail,
          role: "MARKETING_MANAGER",
        },
      },
    );
    expectSuccess(inviteRes);
    expect(inviteRes.data.data.kind).toBe("INVITED");

    const signupRes = await http.post<{
      error: boolean;
      data: { token: string; user: { id: string; email: string; managedApps: string[] } };
    }>("/admin/signup", {
      body: {
        name: "Invited User",
        email: inviteEmail,
        password,
      },
    });
    expectSuccess(signupRes);
    expect(signupRes.data.data.user.email).toBe(inviteEmail);
    expect(signupRes.data.data.user.managedApps).toContain(appId);

    const invitedToken = signupRes.data.data.token;
    const meRes = await http.get<{
      error: boolean;
      data: { email: string; managedApps: string[] };
    }>("/admin/me", { token: invitedToken });
    expectSuccess(meRes);
    expect(meRes.data.data.email).toBe(inviteEmail);
    expect(meRes.data.data.managedApps).toContain(appId);

    const clearAccessRes = await http.put<{
      error: boolean;
      data: { managedApps: string[] };
    }>(`/admin/users/${signupRes.data.data.user.id}/apps`, {
      token: superToken,
      body: { appIds: [] },
    });
    expectSuccess(clearAccessRes);
    expect(clearAccessRes.data.data.managedApps.length).toBe(0);
  });
});
