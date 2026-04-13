# NotifyX Flutter Example App

This Flutter app demonstrates the latest NotifyX SDK integration flow, aligned with the React Native example.

## What It Demonstrates

- SDK initialization with user registration and optional device registration
- FCM token fetch with retry
- Token refresh handling (`onTokenRefresh`) with automatic re-registration
- Sending rich test notifications (`image`, `actionUrl`, `actions`)
- Opening CTA/default links when notifications are tapped:
  - Android: FCM `getInitialMessage` + `onMessageOpenedApp`
  - iOS: APNS bridge from `AppDelegate` into the Flutter SDK
- iOS action buttons for APNS category `notifyx-open-links` (`Open` / `More`)
- Local SDK state persistence and clear/reset flow

## Setup

1. Install dependencies:

```sh
flutter pub get
```

2. Configure Firebase for Android:
- Add `google-services.json` to `android/app/`

3. Configure APNS for iOS:
- Enable `Push Notifications` capability
- Use a valid provisioning profile with push enabled
- Ensure APNS credentials are configured in NotifyX backend

4. Update credentials in `lib/main.dart`:
- `_appId`
- `_apiKey`
- `_baseUrl`

## Notification Icon Setup

- Android small status-bar icons must be bundled inside the app as drawable resources.
- This example now ships `@drawable/ic_stat_notifyx` and registers it as the Firebase default notification icon in [AndroidManifest.xml](./android/app/src/main/AndroidManifest.xml).
- In the NotifyX portal, set the app's `Android Notification Icon Resource` to `ic_stat_notifyx` for this example app.
- On iOS, APNS notifications use the app icon from the Xcode asset catalog. The backend can attach icon metadata, but it cannot replace the system notification icon.

5. Run:

```sh
flutter run
```

## Manual Token Override

For manual push testing, set:
- `_manualPushToken`
- `_manualProvider` (`fcm`, `apns`, or `hms`)

When `_manualPushToken` is set, the app skips FCM token retrieval and uses the provided value.
