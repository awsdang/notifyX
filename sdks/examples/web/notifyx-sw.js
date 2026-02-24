self.addEventListener("push", (event) => {
  console.log("[Service Worker] Push Received.", event);

  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
    console.log("[Service Worker] Push Payload (JSON):", payload);
  } catch (err) {
    console.warn("[Service Worker] Failed to parse JSON, falling back to text.", err);
    payload = { title: "NotifyX", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "NotifyX";
  const options = {
    body: payload.body || "You have a new notification",
    icon: payload.icon || undefined,
    data: payload.data || {},
  };

  // Only add optional fields if they have real values
  if (payload.image) options.image = payload.image;
  if (payload.badge) options.badge = payload.badge;
  if (payload.actions && payload.actions.length > 0) options.actions = payload.actions;

  console.log("[Service Worker] Showing notification:", title, options);
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log("[Service Worker] Notification shown ✅"))
      .catch((err) => console.error("[Service Worker] showNotification error ❌", err))
  );
});

self.addEventListener("notificationclick", (event) => {
  console.log("[Service Worker] Notification Clicked.", {
    action: event.action,
    data: event.notification?.data,
    tag: event.notification.tag,
  });

  event.notification.close();

  const data = event.notification?.data || {};
  let targetUrl = data.actionUrl || "/";

  if (event.action) {
    // Check for per-action URL in data (e.g. data.actionUrl_open_url)
    const actionSpecificUrl = data[`actionUrl_${event.action}`];

    if (actionSpecificUrl) {
      // Action has a specific URL configured
      targetUrl = actionSpecificUrl;
    } else {
      // Handle built-in action types
      switch (event.action) {
        case "open_url":
        case "view_details":
          // Use the default actionUrl
          break;

        case "dismiss":
          // Just close, don't open anything
          console.log("[Service Worker] Dismiss action — notification closed.");
          return;

        case "mark_read":
          // Could call an API here to mark as read
          console.log("[Service Worker] Mark as read action triggered.");
          // For now, just close without opening a URL
          return;

        case "snooze":
          console.log("[Service Worker] Snooze action triggered.");
          // Could re-schedule the notification. For now, just close.
          return;

        case "reply":
          console.log("[Service Worker] Reply action triggered.");
          // Could open a reply UI
          break;

        default:
          // Custom or unknown action — open default URL
          console.log("[Service Worker] Custom action:", event.action);
          break;
      }
    }
  }

  // Open the target URL in an existing window or a new one
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Try to focus an existing window with the same URL
      for (const client of windowClients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(targetUrl);
    })
  );
});
