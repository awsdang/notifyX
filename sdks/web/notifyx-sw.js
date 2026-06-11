self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "NotifyX",
      body: event.data ? event.data.text() : "",
    };
  }

  const title = payload.title || "NotifyX";
  const options = {
    body: payload.body || "You have a new notification",
    icon: payload.icon || undefined,
    data: payload.data || {},
  };

  if (payload.image) options.image = payload.image;
  if (payload.badge) options.badge = payload.badge;
  if (payload.actions && payload.actions.length > 0) {
    options.actions = payload.actions;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

// Self-heal a rotated push subscription. Browsers fire this when they replace
// the endpoint; without re-registering the new endpoint, the user silently
// stops receiving notifications. Config is published by the page SDK via
// syncServiceWorkerConfig() into the "notifyx-config" cache.
function base64UrlToUint8Array(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function readNotifyXConfig() {
  try {
    const cache = await caches.open("notifyx-config");
    const res = await cache.match("notifyx-config");
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function handleSubscriptionChange(event) {
  const config = await readNotifyXConfig();
  if (!config || !config.userId || !config.apiKey || !config.baseUrl) return;

  let subscription = event.newSubscription;
  if (!subscription) {
    const applicationServerKey = config.vapidPublicKey
      ? base64UrlToUint8Array(config.vapidPublicKey)
      : event.oldSubscription?.options?.applicationServerKey;
    subscription = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const body = {
    userId: config.userId,
    platform: "web",
    provider: "web",
    pushToken: JSON.stringify(subscription.toJSON()),
  };
  if (config.externalDeviceId) body.externalDeviceId = config.externalDeviceId;

  await fetch(`${config.baseUrl.replace(/\/$/, "")}/api/v1/users/device`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body: JSON.stringify(body),
  });
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(handleSubscriptionChange(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const tapActionType = data.tapActionType || "open_url";
  let targetUrl = data.actionUrl || "/";

  if (event.action) {
    const actionSpecificUrl = data[`actionUrl_${event.action}`];
    if (actionSpecificUrl) {
      targetUrl = actionSpecificUrl;
    } else {
      switch (event.action) {
        case "dismiss":
        case "mark_read":
        case "snooze":
          return;
        default:
          break;
      }
    }
  } else if (!data.actionUrl && (tapActionType === "dismiss" || tapActionType === "none")) {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      return clients.openWindow(targetUrl);
    }),
  );
});