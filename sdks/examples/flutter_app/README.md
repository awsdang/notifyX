# NotifyX Flutter Example App

This Flutter app demonstrates the latest NotifyX SDK integration flow, aligned with the React Native example.

## What It Demonstrates

- SDK initialization with user registration and optional device registration
- FCM token fetch with retry
- Token refresh handling (`onTokenRefresh`) with automatic re-registration
- Sending rich test notifications (`image`, `actionUrl`, `actions`)
- Opening CTA links when notifications are tapped (cold start + background)
- Local SDK state persistence and clear/reset flow

## Setup

1. Install dependencies:

```sh
flutter pub get
```

2. Configure Firebase for Android/iOS:
- Add `google-services.json` to `android/app/`
- Add `GoogleService-Info.plist` to `ios/Runner/`

3. Update credentials in `lib/main.dart`:
- `_appId`
- `_apiKey`
- `_baseUrl`

4. Run:

```sh
flutter run
```

## Manual Token Override

For manual push testing, set:
- `_manualPushToken`
- `_manualProvider` (`fcm`, `apns`, or `hms`)

When `_manualPushToken` is set, the app skips FCM token retrieval and uses the provided value.
