(function (global) {
  "use strict";

  function base64UrlToUint8Array(base64Url) {
    const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  // Stable, client-managed device identity. Keeps a single device record (and a
  // continuous notification history) across push-subscription rotations.
  function generateUuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  class NotifyXWebSDK {
    constructor(options) {
      if (!options || !options.baseUrl || !options.appId) {
        throw new Error("NotifyXWebSDK requires baseUrl and appId");
      }

      this.baseUrl = String(options.baseUrl).replace(/\/$/, "");
      this.appId = options.appId;
      this.apiKey = options.apiKey || null;
      this.vapidPublicKey = options.vapidPublicKey || null;
      this.serviceWorkerPath = options.serviceWorkerPath || "/notifyx-sw.js";
      this.debug = Boolean(options.debug);
      this.storageKey = `notifyx:web:${this.appId}`;
    }

    // Publish the config the service worker needs to self-heal a rotated push
    // subscription (pushsubscriptionchange) without an open page. Stored via the
    // Cache API because it is the only storage shared with the SW that the page
    // can also write. The apiKey is only suitable here for first-party apps.
    async syncServiceWorkerConfig(extra) {
      if (typeof caches === "undefined") return;
      const state = this.getState() || {};
      try {
        const cache = await caches.open("notifyx-config");
        const config = {
          baseUrl: this.baseUrl,
          appId: this.appId,
          apiKey: this.apiKey,
          vapidPublicKey: this.vapidPublicKey,
          userId: state.userId,
          externalDeviceId: state.externalDeviceId,
          ...(extra || {}),
        };
        await cache.put(
          "notifyx-config",
          new Response(JSON.stringify(config), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (error) {
        this.log("Failed to sync service worker config", error);
      }
    }

    static isSupported() {
      return (
        typeof window !== "undefined" &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window
      );
    }

    async init(config) {
      const settings = config || {};
      if (!NotifyXWebSDK.isSupported()) {
        throw new Error("Web push is not supported in this browser");
      }
      if (!this.apiKey) {
        throw new Error("apiKey is required for direct client registration in this demo");
      }
      if (!this.vapidPublicKey) {
        throw new Error("vapidPublicKey is required");
      }
      if (!settings.externalUserId) {
        throw new Error("externalUserId is required");
      }

      this.log("Step 1/4: Requesting notification permission…");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(`Notification permission is "${permission}". User must allow notifications.`);
      }
      this.log("Step 1/4: Permission granted ✅");

      this.log("Step 2/4: Registering service worker…");
      const registration = await navigator.serviceWorker.register(this.serviceWorkerPath);
      await navigator.serviceWorker.ready;
      this.log("Step 2/4: Service worker ready ✅");

      this.log("Step 3/4: Creating push subscription…");
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(this.vapidPublicKey),
        }));
      this.log("Step 3/4: Push subscription active ✅", existingSubscription ? "(reused existing)" : "(new)");

      this.log("Step 4/4: Registering user & device with API…");
      const user = await this.registerUser({
        externalUserId: settings.externalUserId,
        nickname: settings.nickname,
        phone: settings.phone,
        language: settings.language || navigator.language || "en",
        timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      this.log("User registered", { id: user.id, externalUserId: settings.externalUserId });

      const existingState = this.getState();
      // Always anchor to a stable externalDeviceId so subscription refreshes
      // update the same device record instead of creating a new one each time.
      const externalDeviceId =
        settings.externalDeviceId ||
        existingState?.externalDeviceId ||
        generateUuid();
      const device = await this.registerDevice({
        userId: user.id,
        pushToken: JSON.stringify(subscription.toJSON()),
        externalDeviceId,
      });
      this.log("Device registered", { id: device.id, provider: device.provider });

      const state = {
        ...(existingState || {}),
        userId: user.id,
        deviceId: device.id,
        externalDeviceId: device.externalDeviceId || externalDeviceId,
        externalUserId: settings.externalUserId,
        subscribedAt: new Date().toISOString(),
      };
      localStorage.setItem(this.storageKey, JSON.stringify(state));
      await this.syncServiceWorkerConfig();

      this.log("SDK initialized ✅ — state saved to localStorage", state);
      return { user, device, subscription: subscription.toJSON() };
    }

    async sendTestNotification(payload) {
      const state = this.getState();
      if (!state || !state.deviceId) {
        throw new Error("No registered device found. Call init() first to register a device.");
      }

      const body = {
        appId: this.appId,
        deviceId: state.deviceId,
        title: payload?.title || "NotifyX test",
        subtitle: payload?.subtitle,
        body: payload?.body || "Your web push is working ✅",
        image: payload?.image,
        icon: payload?.icon,
        actionUrl:
          payload?.actionUrl ||
          (typeof window !== "undefined" ? window.location.href : undefined),
        actions: payload?.actions,
        data: payload?.data || { source: "notifyx-web-sdk" },
      };

      const response = await this.request("/api/v1/notifications/test", {
        method: "POST",
        body,
      });

      this.log("Test notification queued", response.data);
      return response.data;
    }

    // Re-register the current push subscription. Call this on page load (after
    // init has run at least once) and from the service worker's
    // `pushsubscriptionchange` flow so NotifyX never holds a stale endpoint.
    // Reuses the stored userId + stable externalDeviceId, so the same device
    // record is updated and the server clears any prior invalid-token state.
    async refreshSubscription() {
      const state = this.getState();
      if (!state || !state.userId) {
        this.log("refreshSubscription called before init(); ignoring.");
        return null;
      }

      const registration = await navigator.serviceWorker.getRegistration(
        this.serviceWorkerPath,
      );
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;
      if (!subscription) {
        this.log("No active push subscription to refresh.");
        return null;
      }

      const externalDeviceId = state.externalDeviceId || generateUuid();
      const device = await this.registerDevice({
        userId: state.userId,
        pushToken: JSON.stringify(subscription.toJSON()),
        externalDeviceId,
      });

      const nextState = {
        ...state,
        deviceId: device.id,
        externalDeviceId: device.externalDeviceId || externalDeviceId,
        refreshedAt: new Date().toISOString(),
      };
      localStorage.setItem(this.storageKey, JSON.stringify(nextState));
      await this.syncServiceWorkerConfig();
      this.log("Subscription refreshed ✅", { id: device.id });
      return device;
    }

    // Fetch this user's notification history. Queries by userId so it
    // aggregates across all of the user's devices.
    async getHistory(query) {
      const q = query || {};
      const state = this.getState();
      const externalUserId = state && state.externalUserId;
      if (!externalUserId) {
        throw new Error("No registered user found. Call init() before getHistory().");
      }

      const page = q.page && q.page > 0 ? q.page : 1;
      const limit = q.limit && q.limit > 0 ? Math.min(q.limit, 100) : 20;
      const params = new URLSearchParams({
        appId: this.appId,
        userId: externalUserId,
        page: String(page),
        limit: String(limit),
      });
      if (q.type) params.set("type", q.type);
      if (q.provider) params.set("provider", q.provider);
      if (q.deliveryStatus) params.set("deliveryStatus", q.deliveryStatus);
      if (q.from) params.set("from", q.from);
      if (q.to) params.set("to", q.to);
      if (q.sortBy) params.set("sortBy", q.sortBy);
      if (q.sortOrder) params.set("sortOrder", q.sortOrder);

      const response = await this.request(
        `/api/v1/notifications/history?${params.toString()}`,
        { method: "GET" },
      );
      const total = typeof response.totalCount === "number" ? response.totalCount : 0;
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

    async unsubscribe() {
      const registration = await navigator.serviceWorker.getRegistration(this.serviceWorkerPath);
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) await subscription.unsubscribe();
      localStorage.removeItem(this.storageKey);
      return { unsubscribed: true };
    }

    getState() {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    async registerUser(data) {
      const response = await this.request("/api/v1/users", {
        method: "POST",
        body: {
          appId: this.appId,
          externalUserId: data.externalUserId,
          nickname: data.nickname,
          phone: data.phone,
          language: data.language,
          timezone: data.timezone,
        },
      });
      return response.data;
    }

    async registerDevice(data) {
      const body = {
        userId: data.userId,
        platform: "web",
        provider: "web",
        pushToken: data.pushToken,
      };
      if (data.externalDeviceId) body.externalDeviceId = data.externalDeviceId;
      if (data.deviceId) body.deviceId = data.deviceId;

      const response = await this.request("/api/v1/users/device", {
        method: "POST",
        body,
      });
      return response.data;
    }

    async request(path, options) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const json = await res.json().catch(() => ({ error: true, message: "Invalid JSON response", data: null }));
      if (!res.ok || json.error) {
        throw new Error(json.message || `Request failed with status ${res.status}`);
      }
      return json;
    }

    log(message, data) {
      if (this.debug) {
        console.log(`[NotifyXWebSDK] ${message}`, data || "");
      }
    }
  }

  global.NotifyXWebSDK = NotifyXWebSDK;
})(typeof window !== "undefined" ? window : globalThis);
