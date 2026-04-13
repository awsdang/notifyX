# NotifyX Web SDK (Fast Browser SDK)

Tiny browser SDK for web push registration + test send with NotifyX.

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

  await notifyX.init({ externalUserId: "web-user-123" });
  await notifyX.sendTestNotification({ title: "Hello", body: "Works" });
</script>
```

## Security note

For production, avoid exposing machine API keys in frontend code. Use your backend to mint short-lived registration/send tokens.

## Notification Icon Notes

- Web push notifications use the app-level uploaded icon URL directly.
- Android mobile apps need a bundled drawable resource name instead of a URL.
- iOS system notifications keep using the app icon configured in Xcode.
