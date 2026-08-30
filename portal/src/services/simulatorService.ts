import { apiRequest } from "./apiClient";

/**
 * Simulator plumbing.
 *
 * Webhook delivery deliberately goes through the API rather than the browser:
 * a customer's webhook host will not send CORS headers back to the portal, and
 * only the server holds the signing secret needed to produce a valid
 * X-NotifyX-Signature. A browser `fetch()` can do neither.
 */

export interface SimUser {
  id: string;
  externalUserId: string;
  nickname: string | null;
  phone: string | null;
  language: string;
  _count?: { devices: number };
}

export interface SimDevice {
  id: string;
  externalDeviceId: string | null;
  platform: string;
  provider: string;
  isActive: boolean;
  tokenInvalidAt: string | null;
  lastSeenAt: string;
  user?: {
    id: string;
    externalUserId: string;
    nickname: string | null;
  };
}

export interface WebhookSimulationResult {
  request: {
    url: string;
    event: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
  response: {
    ok: boolean;
    status: number;
    statusText: string;
    durationMs: number;
    headers: Record<string, string>;
    body: string;
  };
}

export interface TestPushInput {
  appId: string;
  deviceId: string;
  title: string;
  body: string;
  image?: string;
  actionUrl?: string;
  tapActionType?: "open_app" | "open_url" | "deep_link" | "dismiss" | "none";
  data?: Record<string, string>;
}

export const simulatorService = {
  /** Users of an app that actually have a live device to push to. */
  listReachableUsers: async (
    appId: string,
    token: string | null,
    search?: string,
  ): Promise<SimUser[]> => {
    const params = new URLSearchParams({
      appId,
      limit: "25",
      hasDevices: "true",
    });
    if (search) params.set("search", search);
    const res = await apiRequest<{ users: SimUser[] }>(
      `/users?${params}`,
      token,
    );
    return res.users || [];
  },

  listDevices: async (
    appId: string,
    userId: string,
    token: string | null,
  ): Promise<SimDevice[]> => {
    const params = new URLSearchParams({
      appId,
      userId,
      limit: "25",
      isActive: "true",
      tokenValid: "true",
    });
    const res = await apiRequest<{ devices: SimDevice[] }>(
      `/devices?${params}`,
      token,
    );
    return res.devices || [];
  },

  sendTestPush: (input: TestPushInput, token: string | null) =>
    apiRequest<any>("/notifications/test", token, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /** Server-side, signed webhook delivery. */
  simulateWebhook: (
    appId: string,
    payload: { event: string; payload: Record<string, unknown> },
    token: string | null,
  ): Promise<WebhookSimulationResult> =>
    apiRequest(`/apps/${appId}/webhook/simulate`, token, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
