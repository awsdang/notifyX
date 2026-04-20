import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  NotifyXOptions,
  UserRegistrationData,
  DeviceRegistrationData,
  NotifyXUser,
  NotifyXDevice,
  NotificationActionPayload,
} from "./types";

export class NotifyX {
  private appId: string;
  private baseUrl: string;
  private apiKey: string;
  private debug: boolean;
  private storageKey: string;

  constructor(options: NotifyXOptions) {
    if (!options || !options.baseUrl || !options.appId || !options.apiKey) {
      throw new Error("NotifyX requires baseUrl, apiKey, and appId");
    }

    this.baseUrl = String(options.baseUrl).replace(/\/$/, "");
    this.appId = options.appId;
    this.apiKey = options.apiKey;
    this.debug = Boolean(options.debug);
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
    language?: string;
    timezone?: string;
    pushToken?: string;
    platform?: "ios" | "android" | "huawei";
    provider?: "fcm" | "apns" | "hms";
  }): Promise<{ user: NotifyXUser; device?: NotifyXDevice }> {
    this.log("Initializing NotifyX SDK...");

    const user = await this.registerUser({
      externalUserId: params.externalUserId,
      nickname: params.nickname,
      language: params.language,
      timezone: params.timezone,
    });

    let device: NotifyXDevice | undefined;

    if (params.pushToken && params.platform && params.provider) {
      const existingState = await this.getState();
      device = await this.registerDevice({
        userId: user.id,
        pushToken: params.pushToken,
        platform: params.platform,
        provider: params.provider,
        deviceId: existingState?.deviceId,
      });
    }

    const state: Record<string, any> = {
      userId: user.id,
      externalUserId: params.externalUserId,
      initializedAt: new Date().toISOString(),
    };

    if (device) {
      state.deviceId = device.id;
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
        ...(data.deviceId && { deviceId: data.deviceId }),
      },
    });

    const device = response.data;
    const currentState = (await this.getState()) || {};
    currentState.deviceId = device.id;
    await this.saveState(currentState);

    return device;
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
