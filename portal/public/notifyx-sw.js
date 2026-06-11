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