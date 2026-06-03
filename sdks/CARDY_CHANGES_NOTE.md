# NotifyX — What's new for Cardy (phone + test users)

Short note on the latest changes and what (if anything) you need to do.

---

## For Cardy APP developers (SDK)

### 1. You can now send a user's phone number (optional)
`phone` is a new optional field on user registration. If you have it, pass it —
it shows up in the NotifyX dashboard and in the target pickers. Nothing breaks
if you don't send it.

**React Native**
```ts
await notifyx.init({
  externalUserId: user.id,
  nickname: user.name,
  phone: user.phone,          // 👈 new, optional
  pushToken, platform, provider,
});
// or: notifyx.registerUser({ externalUserId, nickname, phone })
```

**Flutter**
```dart
await notifyx.init(
  externalUserId: user.id,
  nickname: user.name,
  phone: user.phone,          // 👈 new, optional
  pushToken: token, platform: 'android', provider: 'fcm',
);
```

**Web**
```js
await notifyx.init({ externalUserId, nickname, phone /* 👈 new */, ... });
```

That's the only app-side change. Recommended format: E.164 (e.g. `+15551234567`),
but any string up to 32 chars is accepted.

> Reminder (unchanged, still important): keep calling `updatePushToken()` on
> token refresh and load history with `getHistory()` — see
> `CARDY_INTEGRATION_RECOMMENDATIONS.md`.

---

## For Cardy BACKEND developers (server-to-server API)

Only relevant if you call the NotifyX REST API directly.

### 1. `phone` on user registration
`POST /api/v1/users` now accepts an optional `phone`:
```json
{ "appId": "…", "externalUserId": "user-123", "nickname": "Jane", "phone": "+15551234567" }
```
It's upserted like `nickname` (send it to set/update, omit to leave unchanged;
empty string clears it). `GET /users` and `GET /users/:id` now return `phone`.

### 2. "Favourite test users" are now stored in NotifyX (no action required)
Favourite test users used to live only in the dashboard browser. They're now
persisted server-side per app (`User.isTestUser`). If you want to manage them
programmatically:

- **Filter:** `GET /api/v1/users?appId=…&isTestUser=true` (favourites only) or
  `isTestUser=false` (everyone else). Each user object now includes `isTestUser`.
- **Set the whole list:** `PUT /api/v1/users/test-favourites`
  ```json
  { "appId": "…", "externalUserIds": ["user-123", "user-456"] }
  ```
  Replaces the favourite set for the app (anyone not in the list is unflagged).
  Returns the canonical persisted list. Requires the same admin/API-key auth as
  other `/users` calls.

### 3. Heads-up: a DB migration ships with this
Two migrations add `users.is_test_user` and `users.phone`. They are additive and
backwards-compatible (both default to empty/false). Run your normal
`prisma migrate deploy` on deploy — no data backfill needed.

---

## Dashboard-only (FYI, no dev work)
In Users & Devices you can mark **favourite test users**; every test-send picker
(Send / Campaigns / A/B Testing) now loads those favourites first, with a
**"Load other users"** button to page through the rest, plus type-to-search.
Pickers now show **name + phone** instead of the raw user id.
