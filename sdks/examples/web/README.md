# NotifyX Web Push Example

## Run locally

Open this folder with a static server (required for service worker):

- `python3 -m http.server 8080`
- then open `http://localhost:8080`
- use `npx serve ./sdks -p 5500 --no-clipboard`
## Requirements

- NotifyX API running (default: `http://localhost:3000`)
- Valid `appId`
- API key with scopes:
  - `users:write`
  - `devices:write`
  - `notifications:test`
- VAPID public key matching backend config

## Demo flow

1. Click **Initialize & Subscribe**
2. Browser asks notification permission
3. SDK registers user + device in NotifyX using the provided `externalDeviceId`
4. Click **Send Test Push**
5. Notification should appear from service worker

## Important

This demo passes `x-api-key` from browser for speed. In production, register/send through your backend with short-lived tokens.

## Notification Icon Setup

- Web notifications can use the uploaded app icon URL directly.
- After uploading an icon in the NotifyX portal, browser pushes from this example will use that icon automatically through the service worker payload.
