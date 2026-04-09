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
  pushToken: '<push-token>',
  platform: 'ios',   // ios | android | huawei
  provider: 'fcm',   // fcm | apns | hms
);
```

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
