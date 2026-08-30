# NotifyX Web SDK (Fast Browser SDK)

Tiny browser SDK for web push registration + test send with NotifyX.

Important: web push also requires a service worker file served from the same
origin as the subscribing page. Use `notifyx-sw.js` from this folder and host
it at `/notifyx-sw.js` on your site, or pass a matching `serviceWorkerPath`.

## What it does

- Requests notification permission
- Registers service worker
- Subscribes to Push API using VAPID public key
- Registers user and device in NotifyX (`/api/v1/users`, `/api/v1/users/device`)
- Sends a test push (`/api/v1/notifications/test`)

## Usage (script tag)

```html
<script src="../../web/notifyx-web-sdk.js"></script>
<script>
  const notifyX = new NotifyXWebSDK({
    baseUrl: "http://localhost:3000",
    appId: "YOUR_APP_ID",
    apiKey: "YOUR_MACHINE_API_KEY",
    vapidPublicKey: "YOUR_VAPID_PUBLIC_KEY",
    serviceWorkerPath: "./notifyx-sw.js",
    debug: true,
  });

  await notifyX.init({
    externalUserId: "web-user-123",
    nickname: "Jane Doe",
  });
  await notifyX.sendTestNotification({ title: "Hello", body: "Works" });
</script>
```

`externalUserId` stays the stable identifier. `nickname` is an optional per-user display alias you can change without changing that identifier.

## Heartbeat (keeps the server's view accurate)

After `init()`, start the heartbeat once. It reports liveness to your own
NotifyX API — **no push provider is involved**, so it cannot be rate-limited by
FCM or Apple.

```html
<script>
  await notifyX.init({ externalUserId: "web-user-123" });

  // sends now, and again whenever the tab returns to the foreground
  const stopHeartbeat = notifyX.startHeartbeat();
</script>
```

Throttled to `heartbeatIntervalHours` (default 24, configurable in the
constructor), so ordinary browsing costs at most one request a day. It never
throws — a failed heartbeat will not break your page.

If the server no longer recognises the device, or the push subscription has
rotated, it replies `action: "register"` and the SDK transparently re-runs
`init()`. A device wrongly marked dead by an earlier failed send is revived.

**What a heartbeat proves:** the page was opened by a real browser holding a
live subscription. **What silence does not prove:** that the subscription is
gone — an infrequent visitor looks the same as someone who cleared site data.

## Security note

For production, avoid exposing machine API keys in frontend code. Use your backend to mint short-lived registration/send tokens.

## Service worker requirement

- Copy `notifyx-sw.js` from this folder to the web app origin that will call the SDK.
- The default path used by the SDK is `/notifyx-sw.js`.
- If your app runs on `https://dashboard.cardyiq.com`, that exact origin must host the worker file.
- A successful `/users` registration alone is not enough; the browser must also complete service worker registration and Push API subscription.

## Notification Icon Notes

- Web push notifications use the app-level uploaded icon URL directly.
- Android mobile apps need a bundled drawable resource name instead of a URL.
- iOS system notifications keep using the app icon configured in Xcode.
