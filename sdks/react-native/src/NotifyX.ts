import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NotifyXOptions,
  UserRegistrationData,
  DeviceRegistrationData,
  NotifyXUser,
  NotifyXDevice,
  NotificationActionPayload,
  NotifyXHistoryQuery,
  NotifyXHistoryResult,
} from "./types";

/**
 * RFC4122 v4 UUID generated without native crypto so it works across all
 * React Native runtimes. Used to mint a stable, client-managed device identity
 * that survives push-token rotation — this is what keeps a device's history on
 * a single record instead of fragmenting across rows on every token refresh.
 */
function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class NotifyX {
  private appId: string;
  private baseUrl: string;
  private apiKey: string;
  private debug: boolean;
  private heartbeatIntervalHours: number;
  private storageKey: string;

  constructor(options: NotifyXOptions) {
    if (!options || !options.baseUrl || !options.appId || !options.apiKey) {
      throw new Error("NotifyX requires baseUrl, apiKey, and appId");
    }

    this.baseUrl = String(options.baseUrl).replace(/\/$/, "");
    this.appId = options.appId;
    this.apiKey = options.apiKey;
    this.debug = Boolean(options.debug);
    // How often heartbeat() actually hits the network; foregrounds inside the
    // window are free.
    this.heartbeatIntervalHours = options.heartbeatIntervalHours ?? 24;
    this.storageKey = `@notifyx:react-native:${this.appId}`;
  }

  private log(message: string, data?: any) {
    if (this.debug) {
      console.log(`[NotifyX SDK] ${message}`, data ? data : "");
    }
  }

  public async getState(): Promise<Record<string, any> | null> {
    try {
      const raw = await AsyncStorage.getItem(this.storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public async clearState(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.storageKey);
      this.log("SDK state cleared.");
    } catch (error) {
      this.log("Failed to clear SDK state", error);
    }
  }

  private async saveState(state: Record<string, any>): Promise<void> {
    try {
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (error) {
      this.log("Failed to save SDK state", error);
    }
  }

  /**
   * Returns the persisted, client-managed device identity, creating and saving
   * one on first use. This is the anchor that keeps a single device record (and
   * therefore a single, continuous notification history) stable across push
   * token rotations and re-registrations.
   */
  public async getOrCreateExternalDeviceId(): Promise<string> {
    const state = (await this.getState()) || {};
    const existing = this.toOptionalTrimmedString(state.externalDeviceId);
    if (existing) return existing;

    const externalDeviceId = generateUuid();
    state.externalDeviceId = externalDeviceId;
    await this.saveState(state);
    this.log("Generated stable externalDeviceId", externalDeviceId);
    return externalDeviceId;
  }

  private toOptionalTrimmedString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private candidateDataMaps(
    data: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const maps: Record<string, unknown>[] = [data];
    const nestedData = data.data;
    if (
      nestedData &&
      typeof nestedData === "object" &&
      !Array.isArray(nestedData)
    ) {
      maps.push(nestedData as Record<string, unknown>);
    }
    return maps;
  }

  public resolveNotificationActionUrl(
    payload?: NotificationActionPayload,
  ): string | undefined {
    const data = payload?.data || undefined;
    if (!data) return undefined;

    const actionId = this.toOptionalTrimmedString(payload?.actionId);

    for (const candidate of this.candidateDataMaps(
      data as Record<string, unknown>,
    )) {
      if (actionId) {
        const actionSpecificUrl =
          this.toOptionalTrimmedString(candidate[`actionUrl_${actionId}`]) ??
          this.toOptionalTrimmedString(candidate[`url_${actionId}`]);
        if (actionSpecificUrl) return actionSpecificUrl;
      }

      const defaultActionUrl =
        this.toOptionalTrimmedString(candidate.actionUrl) ??
        this.toOptionalTrimmedString(candidate.url);
      if (defaultActionUrl) return defaultActionUrl;

      const fallbackPrimary =
        this.toOptionalTrimmedString(candidate.actionUrl_open_link_primary) ??
        this.toOptionalTrimmedString(candidate.url_open_link_primary);
      if (fallbackPrimary) return fallbackPrimary;

      const rawActions = this.toOptionalTrimmedString(candidate.actions);
      if (!rawActions) continue;

      try {
        const parsed = JSON.parse(rawActions);
        if (!Array.isArray(parsed)) continue;

        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const action = item as Record<string, unknown>;

          if (actionId) {
            const parsedActionId = this.toOptionalTrimmedString(action.action);
            const parsedActionUrl = this.toOptionalTrimmedString(action.url);
            if (parsedActionId === actionId && parsedActionUrl)
              return parsedActionUrl;
            if (
              parsedActionId === actionId &&
              !parsedActionUrl &&
              ["dismiss", "mark_read", "snooze"].includes(actionId)
            ) {
              return undefined;
            }
          }

          const firstUrl = this.toOptionalTrimmedString(action.url);
          if (firstUrl) return firstUrl;
        }
      } catch {
        // Ignore malformed actions payload.
      }
    }

    return undefined;
  }

  public async openNotificationAction(
    payload: NotificationActionPayload | undefined,
    openUrl: (url: string) => Promise<unknown>,
  ): Promise<boolean> {
    const url = this.resolveNotificationActionUrl(payload);
    if (!url) return false;

    await openUrl(url);
    return true;
  }

  public async init(params: {
    externalUserId: string;
    nickname?: string;
    phone?: string;
    language?: string;
    timezone?: string;
    externalDeviceId?: string;
    pushToken?: string;
    platform?: "ios" | "android" | "huawei";
    provider?: "fcm" | "apns" | "hms";
  }): Promise<{ user: NotifyXUser; device?: NotifyXDevice }> {
    this.log("Initializing NotifyX SDK...");

    const user = await this.registerUser({
      externalUserId: params.externalUserId,
      nickname: params.nickname,
      phone: params.phone,
      language: params.language,
      timezone: params.timezone,
    });

    let device: NotifyXDevice | undefined;

    // Always anchor the device to a stable, persisted externalDeviceId. If the
    // caller supplied one, adopt it; otherwise reuse the stored one or mint a
    // new one. This guarantees token refreshes update the same device record
    // (continuous history) instead of spawning a new row each time.
    const existingState = await this.getState();
    let externalDeviceId =
      params.externalDeviceId ||
      this.toOptionalTrimmedString(existingState?.externalDeviceId) ||
      undefined;
    if (params.pushToken && params.platform && params.provider) {
      if (!externalDeviceId) {
        externalDeviceId = await this.getOrCreateExternalDeviceId();
      }
      device = await this.registerDevice({
        userId: user.id,
        pushToken: params.pushToken,
        platform: params.platform,
        provider: params.provider,
        externalDeviceId,
      });
    }

    const state: Record<string, any> = {
      ...(existingState || {}),
      userId: user.id,
      externalUserId: params.externalUserId,
      initializedAt: new Date().toISOString(),
    };

    if (externalDeviceId) state.externalDeviceId = externalDeviceId;
    if (device) {
      state.deviceId = device.id;
      if (device.externalDeviceId) {
        state.externalDeviceId = device.externalDeviceId;
      }
    }

    await this.saveState(state);
    this.log("SDK initialized ✅ — state saved", state);

    return { user, device };
  }

  public async registerUser(data: UserRegistrationData): Promise<NotifyXUser> {
    this.log(`Registering user: ${data.externalUserId}`);
    const response = await this.request("/api/v1/users", {
      method: "POST",
      body: {
        appId: this.appId,
        externalUserId: data.externalUserId,
        ...(data.nickname !== undefined && { nickname: data.nickname }),
        ...(data.phone !== undefined && { phone: data.phone }),
        language: data.language || "en",
        timezone: data.timezone || "UTC",
      },
    });
    return response.data;
  }

  public async registerDevice(
    data: DeviceRegistrationData,
  ): Promise<NotifyXDevice> {
    this.log(`Registering device (${data.provider}) for user ${data.userId}`);
    const response = await this.request("/api/v1/users/device", {
      method: "POST",
      body: {
        userId: data.userId,
        pushToken: data.pushToken,
        platform: data.platform,
        provider: data.provider,
        ...(data.externalDeviceId && { externalDeviceId: data.externalDeviceId }),
        ...(data.deviceId && { deviceId: data.deviceId }),
      },
    });

    const device = response.data;
    const currentState = (await this.getState()) || {};
    currentState.deviceId = device.id;
    if (device.externalDeviceId) {
      currentState.externalDeviceId = device.externalDeviceId;
    } else if (data.externalDeviceId) {
      currentState.externalDeviceId = data.externalDeviceId;
    }
    await this.saveState(currentState);

    return device;
  }

  /**
   * Re-register the current device with a fresh push token. Call this from your
   * FCM `onTokenRefresh` / APNs token-update handler so NotifyX never holds a
   * stale token. It reuses the persisted user + stable externalDeviceId, so the
   * same device record is updated in place (history stays intact) and the
   * server clears any prior invalid-token deactivation.
   *
   * Returns null if the SDK has not been initialized yet (no stored userId).
   */
  public async updatePushToken(params: {
    pushToken: string;
    platform: "ios" | "android" | "huawei";
    provider: "fcm" | "apns" | "hms";
  }): Promise<NotifyXDevice | null> {
    const state = await this.getState();
    if (!state?.userId) {
      this.log(
        "updatePushToken called before init(); ignoring. Call init() first.",
      );
      return null;
    }

    const externalDeviceId = await this.getOrCreateExternalDeviceId();
    this.log("Updating push token for stable device", externalDeviceId);
    return this.registerDevice({
      userId: state.userId,
      pushToken: params.pushToken,
      platform: params.platform,
      provider: params.provider,
      externalDeviceId,
    });
  }

  /**
   * Fetch this user's notification history. Queries by userId so it aggregates
   * across every device the user has ever had — robust even if older token
   * rotations fragmented history across multiple device records.
   */
  public async getHistory(
    query: NotifyXHistoryQuery = {},
  ): Promise<NotifyXHistoryResult> {
    const state = await this.getState();
    const externalUserId = state?.externalUserId;
    if (!externalUserId) {
      throw new Error(
        "No registered user found. Call init() before getHistory().",
      );
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const params = new URLSearchParams({
      appId: this.appId,
      userId: externalUserId,
      page: String(page),
      limit: String(limit),
    });
    if (query.type) params.set("type", query.type);
    if (query.provider) params.set("provider", query.provider);
    if (query.deliveryStatus) params.set("deliveryStatus", query.deliveryStatus);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.sortBy) params.set("sortBy", query.sortBy);
    if (query.sortOrder) params.set("sortOrder", query.sortOrder);

    const response = await this.request(
      `/api/v1/notifications/history?${params.toString()}`,
      { method: "GET" },
    );

    const total =
      typeof response.totalCount === "number" ? response.totalCount : 0;
    return {
      items: Array.isArray(response.data) ? response.data : [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  public async sendTestNotification(payload?: {
    title?: string;
    subtitle?: string;
    body?: string;
    image?: string;
    icon?: string;
    actionUrl?: string;
    actions?: Array<{ action: string; title: string; url?: string }>;
    data?: Record<string, any>;
  }): Promise<any> {
    const state = await this.getState();
    if (!state || !state.deviceId) {
      throw new Error(
        "No registered device found. Call init() or registerDevice() first.",
      );
    }

    const bodyData: Record<string, any> = {
      appId: this.appId,
      deviceId: state.deviceId,
      title: payload?.title || "NotifyX test",
      body: payload?.body || "Your React Native SDK push is working ✅",
      actionUrl: payload?.actionUrl || "https://example.com",
      data: payload?.data || { source: "notifyx-react-native-sdk" },
    };

    if (payload?.subtitle != null) bodyData.subtitle = payload.subtitle;
    if (payload?.image != null) bodyData.image = payload.image;
    if (payload?.icon != null) bodyData.icon = payload.icon;
    if (payload?.actions != null) bodyData.actions = payload.actions;

    this.log("Sending test notification...");
    const response = await this.request("/api/v1/notifications/test", {
      method: "POST",
      body: bodyData,
    });
    this.log("Test notification queued", response.data);
    return response.data;
  }

  /**
   * True when an incoming push is NotifyX asking this device to re-register
   * rather than something to show the user.
   *
   * Wire it into your background/foreground message handlers and return early
   * so no UI is shown:
   *
   * ```ts
   * messaging().setBackgroundMessageHandler(async (message) => {
   *   if (notifyX.isResubscribeRequest(message)) {
   *     await notifyX.syncRegistration({
   *       externalUserId: currentUserId,
   *       pushToken: await messaging().getToken(),
   *       platform: Platform.OS === "ios" ? "ios" : "android",
   *       provider: Platform.OS === "ios" ? "apns" : "fcm",
   *     });
   *     return;
   *   }
   *   // ...your normal handling
   * });
   * ```
   */
  public isResubscribeRequest(message: {
    data?: Record<string, unknown> | null;
  }): boolean {
    return message?.data?.notifyx_action === "resubscribe";
  }

  /**
   * Re-assert this device's registration: refreshes the push token, clears any
   * server-side invalidation, and updates `lastSeenAt`.
   *
   * Call this on **every app launch**, not just first install. That single
   * habit is what prevents the most common way users go dark — a device whose
   * token rotated (reinstall, restore to a new handset, cleared app data) while
   * the app only ever registered once. The server reuses the same device row
   * via the persisted `externalDeviceId`, so history stays continuous.
   */
  public async syncRegistration(params: {
    externalUserId: string;
    pushToken: string;
    platform: "ios" | "android" | "huawei";
    provider: "fcm" | "apns" | "hms";
    nickname?: string;
    phone?: string;
  }): Promise<{ user: NotifyXUser; device?: NotifyXDevice }> {
    this.log("Syncing registration (launch/resubscribe)");
    return this.init(params);
  }

  /**
   * Tell the server this device is alive.
   *
   * Cheap by design — one request against your own API, no FCM/APNs traffic,
   * so it can run on every app foreground without any risk of tripping a
   * provider rate limit. This is what keeps `lastSeenAt` honest and lets the
   * server distinguish "quiet user" from "uninstalled".
   *
   * Throttled to `heartbeatIntervalHours` (default 24h) using the SDK's
   * persisted state; pass `{ force: true }` to bypass. Never throws — a failed
   * heartbeat must not break app startup.
   *
   * When the server no longer recognises the device, or the push token has
   * rotated, it replies `action: "register"`. Supply `pushToken`/`platform`/
   * `provider` and this re-registers automatically.
   */
  public async heartbeat(params?: {
    force?: boolean;
    pushToken?: string;
    platform?: "ios" | "android" | "huawei";
    provider?: "fcm" | "apns" | "hms";
  }): Promise<{ action?: string; revived?: boolean; skipped?: string }> {
    try {
      const state = (await this.getState()) || {};
      const identity = this.toOptionalTrimmedString(state.externalDeviceId);
      const deviceId = this.toOptionalTrimmedString(state.deviceId);
      if (!identity && !deviceId) return { skipped: "not-registered" };

      const intervalMs = this.heartbeatIntervalHours * 3600 * 1000;
      const last = state.lastHeartbeatAt
        ? Date.parse(String(state.lastHeartbeatAt))
        : 0;
      if (!params?.force && Date.now() - last < intervalMs) {
        return { skipped: "throttled" };
      }

      const body: Record<string, unknown> = { appId: this.appId };
      if (identity) body.externalDeviceId = identity;
      else body.deviceId = deviceId;
      if (params?.pushToken) body.pushToken = params.pushToken;

      const response = await this.request("/api/v1/devices/heartbeat", {
        method: "POST",
        body,
      });
      const result = response.data || {};

      await this.saveState({
        ...state,
        lastHeartbeatAt: new Date().toISOString(),
      });

      if (
        result.action === "register" &&
        params?.pushToken &&
        params.platform &&
        params.provider &&
        state.externalUserId
      ) {
        this.log(`Server asked for re-registration: ${result.reason}`);
        await this.syncRegistration({
          externalUserId: String(state.externalUserId),
          pushToken: params.pushToken,
          platform: params.platform,
          provider: params.provider,
        });
        return { ...result, reregistered: true } as any;
      }

      if (result.revived) {
        this.log("Device was marked dead server-side and has been revived");
      }
      return result;
    } catch (error: any) {
      this.log("Heartbeat failed (ignored)", error?.message || error);
      return { skipped: "error" };
    }
  }

  /**
   * Heartbeat now and on every return to the foreground.
   *
   * ```ts
   * import { AppState } from "react-native";
   * const stop = notifyX.startHeartbeat(AppState, () => ({
   *   pushToken: currentToken,
   *   platform: Platform.OS === "ios" ? "ios" : "android",
   *   provider: Platform.OS === "ios" ? "apns" : "fcm",
   * }));
   * ```
   *
   * Returns a function that removes the listener.
   */
  public startHeartbeat(
    appState: {
      addEventListener: (
        type: "change",
        handler: (state: string) => void,
      ) => { remove: () => void };
    },
    getContext?: () => {
      pushToken?: string;
      platform?: "ios" | "android" | "huawei";
      provider?: "fcm" | "apns" | "hms";
    },
  ): () => void {
    void this.heartbeat(getContext?.());

    const subscription = appState.addEventListener("change", (next) => {
      if (next === "active") void this.heartbeat(getContext?.());
    });

    return () => subscription.remove();
  }

  private async request(path: string, options: { method: string; body?: any }) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let json;
    try {
      json = await res.json();
    } catch {
      json = { error: true, message: "Invalid JSON response" };
    }

    if (!res.ok || json.error) {
      throw new Error(
        json.message || `Request failed with status ${res.status}`,
      );
    }
    return json;
  }
}
