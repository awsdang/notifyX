# NotifyX — Integration Guide & Re-implementation Recommendations (for Cardy)

This document explains the two production issues you reported and the concrete
changes required **in Cardy** to fully fix them. The matching fixes on the
NotifyX server and SDKs have already shipped — this is what *you* need to wire
up to benefit from them.

> TL;DR
> 1. Give every device a **stable `externalDeviceId`** and never let it change. The
>    SDKs now do this for you automatically, but you must let the SDK own device
>    identity (don't clear SDK storage on logout unless you mean it).
> 2. **Re-register the push token whenever it rotates** — wire your FCM
>    `onTokenRefresh` / APNs token-update callbacks to `updatePushToken()`.
> 3. **Load history by `externalUserId`, not by `deviceId`** — use the new
>    `getHistory()` helper.

---

## Background: how identity works in NotifyX

| Concept | Keyed by | Stable across… |
|---|---|---|
| **User** | `(appId, externalUserId)` | reinstall, token rotation — as long as you pass the same `externalUserId` |
| **Device** | `(tokenHash, provider)` **or** `externalDeviceId` | token rotation **only if** an `externalDeviceId` anchors it |
| **History** (`NotificationDelivery`) | `deviceId` (FK) | only as stable as the device row |

The key insight: **history is attached to a device row**. If a device row is
recreated, that history is stranded on the old row. A device row is recreated
whenever the push token changes *and* there is no stable `externalDeviceId` to
re-anchor it.

---

## Issue 1 — History is partial or missing

### Root causes
1. **No stable `externalDeviceId`.** Each push-token rotation created a *new*
   device row, splitting a user's history across many rows.
2. **History was likely queried by `deviceId`.** That only ever returns the
   slice on one device row, so it looks like history "disappeared" after a
   token change or reinstall.
3. **Server-side data loss (now fixed):** the admin "Deactivate device" action
   was deleting the entire *user* — cascading away every device and all
   delivery history. If your team or portal used it, that permanently wiped
   history. This is fixed: deactivation now disables only the one device.

### What Cardy must do
- **Always query history by user.** Use the new SDK method:

  ```ts
  // React Native / TypeScript
  const { items, pagination } = await notifyx.getHistory({ page: 1, limit: 20 });
  ```
  ```dart
  // Flutter
  final result = await notifyx.getHistory(page: 1, limit: 20);
  ```
  ```js
  // Web
  const { items, pagination } = await notifyx.getHistory({ page: 1, limit: 20 });
  ```

  If you call the REST endpoint directly, query **by `userId` (your
  `externalUserId` is accepted)**, never by `deviceId`:

  ```
  GET /api/v1/notifications/history?appId={appId}&userId={externalUserId}&page=1&limit=20
  ```

  This aggregates across **all** of the user's devices, so history stays
  complete even for users whose history was fragmented before this fix.

- **Let the SDK manage `externalDeviceId`.** The SDKs now generate and persist a
  UUID device identity on first `init()`. You do **not** need to pass one. If you
  *do* have your own stable per-install id (e.g. iOS `identifierForVendor`,
  Android app-scoped install id), you may pass it as `externalDeviceId` to
  `init()` — but then pass it **consistently forever**.

- **Don't wipe SDK storage casually.** Clearing AsyncStorage / SharedPreferences
  / localStorage resets the device identity and starts a new device row. Only
  call `clearState()` on a true "forget this device" event.

---

## Issue 2 — Users stop receiving notifications after a few days

### Root causes
1. **Push tokens rotate.** FCM rotates tokens (app update, restore, data
   restore, periodic refresh); APNs tokens change; Web Push endpoints rotate.
   Cardy was only sending the token to NotifyX during `init()`, so after a
   rotation NotifyX held a **dead token** and every send silently failed.
2. **Permanent auto-deactivation (now fixed).** When a push failed with an
   invalid token, the worker set `tokenInvalidAt` and `isActive=false` to stop
   wasting sends. **Re-registration did not clear `tokenInvalidAt`**, so even
   after the app came back with a fresh, valid token, the device stayed
   excluded **forever**. This was the main "never recovers" cause. Fixed:
   re-registering any device now clears `tokenInvalidAt` / deactivation state and
   makes it eligible again.

### What Cardy must do
**Wire token refresh to `updatePushToken()`.** This is the single most important
change on your side.

**React Native (Firebase Messaging):**
```ts
import messaging from "@react-native-firebase/messaging";

// Call once, near app start, AFTER notifyx.init(...)
messaging().onTokenRefresh(async (newToken) => {
  await notifyx.updatePushToken({
    pushToken: newToken,
    platform: Platform.OS === "ios" ? "ios" : "android",
    provider: Platform.OS === "ios" ? "apns" : "fcm",
  });
});
```

**Flutter:**
```dart
FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
  await notifyx.updatePushToken(
    pushToken: newToken,
    platform: Platform.isIOS ? 'ios' : 'android',
    provider: Platform.isIOS ? 'apns' : 'fcm',
  );
});
```

**Web:** the bundled service worker now self-heals rotated subscriptions
(`pushsubscriptionchange`). Two requirements:
- Call `notifyx.init(...)` at least once so the SDK publishes the config the
  service worker needs.
- On every page load (after the first init), also call:
  ```js
  await notifyx.refreshSubscription();
  ```

`updatePushToken()` / `refreshSubscription()` reuse the stored `userId` and
stable `externalDeviceId`, so they update the **same** device row (history
intact) and reactivate it on the server.

### Belt-and-suspenders: re-register on every launch
Even with refresh listeners, call `init()` (or `updatePushToken()`) on every app
launch / foreground with the current token. It's cheap and idempotent, and it
guarantees NotifyX always holds the live token and a fresh `lastSeenAt`.

---

## Recommended Cardy lifecycle (canonical)

```
App start
  └─ notifyx.init({ externalUserId, pushToken, platform, provider })   // user + device, mints stable externalDeviceId
       └─ register messaging().onTokenRefresh -> notifyx.updatePushToken(...)

On token refresh (any time)
  └─ notifyx.updatePushToken({ pushToken, platform, provider })        // updates same device row, clears invalid state

On every launch / foreground
  └─ notifyx.init(...) OR notifyx.updatePushToken(...)                 // keep token + lastSeenAt fresh

Show history
  └─ notifyx.getHistory({ page, limit })                              // by user, aggregates all devices

On explicit logout / "forget device"
  └─ notifyx.clearState()                                             // only when you truly mean it
```

## Things to STOP doing
- ❌ Sending the token only once at install.
- ❌ Generating a new device id per launch, or deriving it from the push token.
- ❌ Loading history by `deviceId`.
- ❌ Using the admin "Deactivate device" expecting it to clean one device while
  keeping data — (it used to delete the user; it's fixed now, but treat
  deactivation as "stop sending to this device", not "erase user").
- ❌ Clearing SDK storage on routine events (cache clears, settings resets).

---

---

## Issue 3 — Media (images) & notification types: required client work

These are verified against the official APNs and FCM docs. The server now sends
the right payloads, but **rich media and action buttons require client-side
support that Cardy must add** — otherwise images/buttons silently don't appear.

### iOS images need a Notification Service Extension (NSE)
APNs cannot fetch an image itself. NotifyX sends the image URL in the payload and
sets `mutable-content: 1`, but iOS will only render the image if your app
includes a **Notification Service Extension** that downloads the URL and attaches
it. Without the NSE, iOS shows text only.
- Add a Notification Service Extension target to the Cardy iOS app.
- In `didReceive`, read `request.content.userInfo["image"]` (also sent as
  `attachment-url` / `imageUrl`), download it, and add a `UNNotificationAttachment`.
- Android images work out of the box (FCM `notification.image` → big picture).

### Android 8.0+ needs a notification channel — or pushes won't show
On Android 8+ a notification **without a valid channel does not display at all**,
and if the FCM SDK auto-creates a channel while your app is backgrounded, the
**first notification can be lost**. Do **both** of these in Cardy:
- Create your notification channel(s) at app startup (not lazily).
- Declare a default channel in `AndroidManifest.xml`:
  ```xml
  <meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="cardy_default" />
  ```
- NotifyX now also supports a per-notification `androidChannelId` and a server
  default (`FCM_DEFAULT_CHANNEL_ID`) — but the channel must still **exist on the
  device**, so the manifest entry above is mandatory.

### Action buttons & "data vs notification" messages
NotifyX sends a **hybrid `notification` + `data`** FCM message. Per the FCM docs,
when the app is **backgrounded**, Android auto-displays the `notification` block
in the system tray, your `onMessageReceived` is **not** called, and **action
buttons carried in `data` are not rendered**. Implications for Cardy:
- **Tap-to-open + title/body/image:** work today with no extra code.
- **Custom action buttons on Android while backgrounded:** require switching that
  notification class to **data-only** and building the notification yourself in a
  `FirebaseMessagingService.onMessageReceived` (read `actions` from `data`). Trade-off:
  data-only messages are not auto-displayed and are throttled/dropped if the app
  is force-stopped — only adopt this for notifications that genuinely need buttons.
- **iOS action buttons:** register a `UNNotificationCategory` whose identifier
  matches the category NotifyX sends (`notifyx-open-links`) and add the matching
  `UNNotificationAction`s, or the buttons won't appear.

### Delivery timing / store-and-forward
NotifyX previously sent APNs `apns-expiration: 0`, meaning **"discard if the
device is offline right now."** That alone could explain pushes that "never
arrived" for backgrounded/offline devices. This is fixed — APNs now stores and
retries for up to the message TTL (default 24h). If you want a different window
per notification, set a `ttl`. FCM already stores for up to 4 weeks by default.

---

## Server/SDK changes already shipped (for your reference)
- **Server:** `registerDevice` now resets `tokenInvalidAt`, `tokenExpiresAt`, and
  all deactivation fields on every (re-)registration, so a device with a fresh
  token is immediately eligible for delivery again.
- **Server:** `deactivateDevice` now deactivates the single device instead of
  deleting the user and cascading away all devices + history.
- **Server (APNs):** `apns-expiration` is now a real store-and-forward window
  (was `0` = discard if offline); the HTTP/2 connection to APNs is now **kept
  open and reused** across notifications (Apple treats per-push connect/close as
  a DoS and throttles it); `apns-collapse-id` is sent when a collapse key is set.
- **Server (FCM):** Android payloads now carry `channel_id` when provided
  (per-message `androidChannelId` or `FCM_DEFAULT_CHANNEL_ID`).
- **SDKs (RN / Flutter / Web):** auto-generate & persist a stable
  `externalDeviceId`; new `updatePushToken()` (RN/Flutter) /
  `refreshSubscription()` (Web); new `getHistory()`; the web service worker
  handles `pushsubscriptionchange` to self-heal rotated subscriptions.

## One-time note on historical data
Users whose history was fragmented across multiple device rows *before* this fix
will see it reunified automatically **as soon as you query by `userId`** — no
backfill needed. The only unrecoverable data is history for any user that was
removed by the old destructive "Deactivate device" behavior; that is gone and
cannot be restored.
