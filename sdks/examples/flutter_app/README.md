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

5. Run:

```sh
flutter run
```

## Manual Token Override

For manual push testing, set:
- `_manualPushToken`
- `_manualProvider` (`fcm`, `apns`, or `hms`)

When `_manualPushToken` is set, the app skips FCM token retrieval and uses the provided value.
