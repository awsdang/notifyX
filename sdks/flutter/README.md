# NotifyX Flutter SDK

Official Flutter SDK for NotifyX.

## Install

```yaml
dependencies:
  notifyx:
    path: ../flutter
```

## Initialize

```dart
import 'package:notifyx/notifyx.dart';

final notifyX = NotifyX(
  appId: 'YOUR_APP_ID',
  baseUrl: 'https://api.notifyx.com',
  apiKey: 'YOUR_API_KEY',
  debug: true,
);
```

## Register User + Device

```dart
await notifyX.init(
  externalUserId: 'user-12345',
  nickname: 'Jane Doe',
  externalDeviceId: 'ios-vendor-123',
  pushToken: '<push-token>',
  platform: 'ios',   // ios | android | huawei
  provider: 'fcm',   // fcm | apns | hms
);
```

`externalUserId` remains the durable user key. `nickname` is an optional per-user display alias.
`externalDeviceId` is the client-managed device key the SDK reuses on later subscriptions so NotifyX updates the same device record instead of creating duplicates.

## Keep the Device Registered (important)

Call `syncRegistration` on **every app launch**, not just on first install.

A push token is not permanent — it rotates on reinstall, on restore to a new
handset, and when app data is cleared. If your app only registers once, the
server keeps the old token, every send to it fails, NotifyX marks the device
dead, and that user silently stops receiving notifications forever.

```dart
// on app start, once you know who the user is
await notifyX.syncRegistration(
  externalUserId: currentUserId,
  pushToken: (await FirebaseMessaging.instance.getToken())!,
  platform: Platform.isIOS ? 'ios' : 'android',
  provider: Platform.isIOS ? 'apns' : 'fcm',
);

// and whenever the token rotates
FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
  await notifyX.syncRegistration(
    externalUserId: currentUserId,
    pushToken: token,
    platform: Platform.isIOS ? 'ios' : 'android',
    provider: Platform.isIOS ? 'apns' : 'fcm',
  );
});
```

Because the SDK persists a stable `externalDeviceId`, these calls update the
*same* device record rather than creating duplicates — so the device keeps one
continuous notification history, and any earlier "token dead" flag is cleared.

## Heartbeat (keeps the server's view accurate)

Call `heartbeat()` when the app resumes. It is a single request to your own
NotifyX API — **no FCM/APNs traffic**, so it cannot trip a provider rate limit
no matter how many devices you have.

```dart
class _AppState extends State<App> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _beat();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _beat();
  }

  Future<void> _beat() async {
    await notifyX.heartbeat(
      pushToken: await FirebaseMessaging.instance.getToken(),
      platform: Platform.isIOS ? 'ios' : 'android',
      provider: Platform.isIOS ? 'apns' : 'fcm',
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
```

Throttled to `heartbeatIntervalHours` (default 24), so resuming the app twenty
times a day still costs one request. It never throws.

The server answers with a directive. If it no longer recognises the device, or
the push token has rotated, it replies `action: "register"` and — when you pass
`pushToken`/`platform`/`provider` as above — the SDK re-registers on the spot.
If the device had been wrongly flagged dead by an earlier failed send, a
heartbeat revives it.

**What a heartbeat proves:** the app is installed and running. **What silence
does not prove:** that the app was uninstalled — a user who simply has not
opened it in two months looks the same. Treat missing heartbeats as "unknown",
not "dead".

## Handle the Re-subscribe Ping

If the server's device-health sweep is enabled, NotifyX may send a silent
control message asking a device to re-register. It carries no title or body —
check for it first so you never render it as a notification.

```dart
Future<void> _onMessage(RemoteMessage message) async {
  if (notifyX.isResubscribeRequest(message.data)) {
    await notifyX.syncRegistration(
      externalUserId: currentUserId,
      pushToken: (await FirebaseMessaging.instance.getToken())!,
      platform: Platform.isIOS ? 'ios' : 'android',
      provider: Platform.isIOS ? 'apns' : 'fcm',
    );
    return;
  }
  // ...your normal notification handling
}
```

Note this cannot revive a token the provider has already rejected — if the
message arrived, the token was alive. What it fixes is server-side state that
has drifted out of date.

## Send Test Notification

```dart
await notifyX.sendTestNotification(
  title: 'Hello',
  body: 'Test notification from Flutter SDK',
  actionUrl: 'https://example.com',
  actions: [
    {'action': 'open_link_primary', 'title': 'Open', 'url': 'https://example.com'},
  ],
);
```

## Resolve/Open CTA Action URL

Use the same action URL resolution logic as the React Native SDK:

```dart
final url = notifyX.resolveNotificationActionUrl(
  NotificationActionPayload(
    actionId: 'open_link_primary',
    data: message.data,
  ),
);
```

Or open in one step:

```dart
await notifyX.openNotificationAction(
  NotificationActionPayload(data: message.data, actionId: 'open_link_primary'),
  (url) async {
    // your URL opener here
  },
);
```

## iOS APNS Open Handling

When using APNS directly on iOS, wire the SDK's APNS bridge:

```dart
await notifyX.configureApnsNotificationOpenHandler((payload) async {
  await notifyX.openNotificationAction(payload, (url) async {
    // Open URL in browser/app
  });
});
```

Fetch APNS token from the same bridge:

```dart
final apnsToken = await notifyX.getApnsToken();
```
