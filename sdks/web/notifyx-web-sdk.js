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
        language: settings.language || navigator.language || "en",
        timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      this.log("User registered", { id: user.id, externalUserId: settings.externalUserId });

      const device = await this.registerDevice({
        userId: user.id,
        pushToken: JSON.stringify(subscription.toJSON()),
      });
      this.log("Device registered", { id: device.id, provider: device.provider });

      const state = {
        userId: user.id,
        deviceId: device.id,
        externalUserId: settings.externalUserId,
        subscribedAt: new Date().toISOString(),
      };
      localStorage.setItem(this.storageKey, JSON.stringify(state));

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
          language: data.language,
          timezone: data.timezone,
        },
      });
      return response.data;
    }

    async registerDevice(data) {
      const response = await this.request("/api/v1/users/device", {
        method: "POST",
        body: {
          userId: data.userId,
          platform: "web",
          provider: "web",
          pushToken: data.pushToken,
        },
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
