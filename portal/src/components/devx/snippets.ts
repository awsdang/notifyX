/**
 * Integration snippets generated from the app you actually have selected.
 *
 * Everything here targets the SDKs that live in this repository under `sdks/`
 * and the endpoints that exist in `api/src/routes.ts` — no invented packages,
 * no placeholder hosts. The app id, API base URL and VAPID key are substituted
 * in so a snippet can be copied and run as-is.
 */

export const REPO_URL = "https://github.com/awsdang/notifyX";
export const SDK_TREE = `${REPO_URL}/tree/main/sdks`;

export interface SnippetContext {
  appId: string;
  appName: string;
  baseUrl: string;
  vapidPublicKey: string | null;
}

export interface CodeStep {
  title: string;
  description?: string;
  language: string;
  code: string;
  /** Shown as a shell command above the block. */
  filename?: string;
}

export interface PlatformIntegration {
  key: "web" | "react-native" | "flutter" | "server";
  label: string;
  tagline: string;
  /** Directory in the repo that holds the SDK, if any. */
  sourcePath?: string;
  sourceHref?: string;
  steps: CodeStep[];
}

const PLACEHOLDER_VAPID = "<generate a VAPID key under Credentials → Web Push>";

export function buildIntegrations(ctx: SnippetContext): PlatformIntegration[] {
  const { appId, baseUrl } = ctx;
  const vapid = ctx.vapidPublicKey || PLACEHOLDER_VAPID;

  return [
    {
      key: "web",
      label: "Web",
      tagline: "Vanilla JS + service worker, no build step required",
      sourcePath: "sdks/web",
      sourceHref: `${SDK_TREE}/web`,
      steps: [
        {
          title: "Copy the SDK and service worker into your site",
          description:
            "Both files must be served from the same origin as the page that subscribes. The worker has to sit at the origin root so its scope covers the whole site.",
          language: "bash",
          code: `# from a clone of ${REPO_URL}
cp sdks/web/notifyx-web-sdk.js  ./public/notifyx-web-sdk.js
cp sdks/web/notifyx-sw.js       ./public/notifyx-sw.js   # must end up at /notifyx-sw.js`,
        },
        {
          title: "Initialise and subscribe",
          description:
            "init() asks for permission, registers the worker, subscribes to the Push API, then registers the user and device with NotifyX.",
          language: "html",
          filename: "index.html",
          code: `<script src="/notifyx-web-sdk.js"></script>
<script>
  const notifyX = new NotifyXWebSDK({
    baseUrl: "${baseUrl}",
    appId: "${appId}",
    apiKey: "YOUR_MACHINE_API_KEY",
    vapidPublicKey: "${vapid}",
    serviceWorkerPath: "/notifyx-sw.js",
    debug: true,
  });

  await notifyX.init({
    externalUserId: "web-user-123",   // your stable user id
    nickname: "Jane Doe",             // optional display alias
  });
</script>`,
        },
        {
          title: "Start the heartbeat",
          description:
            "Reports liveness to NotifyX — your own API, not the push provider — so a device that is still installed never gets mistaken for a dead one. Throttled to once a day; never throws.",
          language: "javascript",
          code: `// after init(), once
const stopHeartbeat = notifyX.startHeartbeat();`,
        },
        {
          title: "Send yourself a test",
          language: "javascript",
          code: `await notifyX.sendTestNotification({
  title: "Hello from ${ctx.appName || "NotifyX"}",
  body: "Web push is wired up correctly.",
});`,
        },
        {
          title: "Before you ship",
          description:
            "The browser SDK needs an API key to call NotifyX. Do not ship a long-lived machine key in page source — proxy the registration call through your own backend and keep the key server-side.",
          language: "javascript",
          code: `// your backend
app.post("/push/register", async (req, res) => {
  const r = await fetch("${baseUrl}/api/v1/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.NOTIFYX_API_KEY,   // stays on the server
    },
    body: JSON.stringify({
      appId: "${appId}",
      externalUserId: req.user.id,
    }),
  });
  res.json(await r.json());
});`,
        },
      ],
    },
    {
      key: "react-native",
      label: "React Native",
      tagline: "TypeScript SDK with persistent device identity",
      sourcePath: "sdks/react-native",
      sourceHref: `${SDK_TREE}/react-native`,
      steps: [
        {
          title: "Add the SDK",
          description:
            "The package is published from this repo rather than npm — point at the folder directly or vendor it into your app.",
          language: "bash",
          code: `npm install ${REPO_URL.replace("https://github.com/", "github:")}#main --save
# or, from a local clone:
npm install ../notifyX/sdks/react-native

npm install @react-native-async-storage/async-storage   # peer dependency`,
        },
        {
          title: "Create the client",
          language: "typescript",
          filename: "src/notifyx.ts",
          code: `import { NotifyX } from "@notifyx/react-native";

export const notifyX = new NotifyX({
  appId: "${appId}",
  baseUrl: "${baseUrl}",
  apiKey: "YOUR_MACHINE_API_KEY",
  debug: __DEV__,
});`,
        },
        {
          title: "Register the user and device",
          description:
            "externalDeviceId is generated and persisted by the SDK, so a token refresh updates the same device row instead of creating a duplicate — that is what keeps a device's notification history continuous.",
          language: "typescript",
          code: `import messaging from "@react-native-firebase/messaging";
import { notifyX } from "./notifyx";

await messaging().requestPermission();
const pushToken = await messaging().getToken();

await notifyX.init({
  externalUserId: "user-12345",
  nickname: "Jane Doe",
  pushToken,
  platform: Platform.OS === "ios" ? "ios" : "android",
  provider: Platform.OS === "ios" ? "apns" : "fcm",
});

// keep the same device record when the token rotates
messaging().onTokenRefresh(async (token) => {
  await notifyX.init({ externalUserId: "user-12345", pushToken: token,
    platform: Platform.OS === "ios" ? "ios" : "android",
    provider: Platform.OS === "ios" ? "apns" : "fcm" });
});`,
        },
        {
          title: "Start the heartbeat",
          description:
            "Reports liveness to NotifyX on every foreground — your own API, not FCM/APNs, so it cannot be rate-limited. Throttled to once a day; never throws.",
          language: "typescript",
          code: `import { AppState, Platform } from "react-native";

const stopHeartbeat = notifyX.startHeartbeat(AppState, () => ({
  pushToken: currentToken,
  platform: Platform.OS === "ios" ? "ios" : "android",
  provider: Platform.OS === "ios" ? "apns" : "fcm",
}));`,
        },
        {
          title: "Handle a notification tap",
          language: "typescript",
          code: `import { Linking } from "react-native";

messaging().onNotificationOpenedApp(async (message) => {
  const url = notifyX.resolveNotificationActionUrl({
    data: message.data,
    actionId: null,
  });
  if (url) await Linking.openURL(url);
});`,
        },
      ],
    },
    {
      key: "flutter",
      label: "Flutter",
      tagline: "Dart SDK covering iOS, Android and Huawei",
      sourcePath: "sdks/flutter",
      sourceHref: `${SDK_TREE}/flutter`,
      steps: [
        {
          title: "Add the dependency",
          language: "yaml",
          filename: "pubspec.yaml",
          code: `dependencies:
  notifyx:
    git:
      url: ${REPO_URL}.git
      path: sdks/flutter
      ref: main`,
        },
        {
          title: "Create the client",
          language: "dart",
          code: `import 'package:notifyx/notifyx.dart';

final notifyX = NotifyX(
  appId: '${appId}',
  baseUrl: '${baseUrl}',
  apiKey: 'YOUR_MACHINE_API_KEY',
  debug: true,
);`,
        },
        {
          title: "Register user + device",
          description:
            "provider picks the transport: fcm for Google Android, apns for iOS, hms for Huawei devices without Play Services.",
          language: "dart",
          code: `final token = await FirebaseMessaging.instance.getToken();

await notifyX.init(
  externalUserId: 'user-12345',
  nickname: 'Jane Doe',
  externalDeviceId: 'ios-vendor-123',
  pushToken: token!,
  platform: Platform.isIOS ? 'ios' : 'android',
  provider: Platform.isIOS ? 'apns' : 'fcm',
);`,
        },
        {
          title: "Start the heartbeat",
          description:
            "Call on app resume. One request to your own API — no FCM/APNs traffic — so it scales to any device count without provider limits.",
          language: "dart",
          code: `// in didChangeAppLifecycleState, on AppLifecycleState.resumed
await notifyX.heartbeat(
  pushToken: await FirebaseMessaging.instance.getToken(),
  platform: Platform.isIOS ? 'ios' : 'android',
  provider: Platform.isIOS ? 'apns' : 'fcm',
);`,
        },
        {
          title: "Open the tap target",
          language: "dart",
          code: `await notifyX.openNotificationAction(
  NotificationActionPayload(
    data: message.data,
    actionId: 'open_link_primary',
  ),
  (url) async => launchUrl(Uri.parse(url)),
);`,
        },
      ],
    },
    {
      key: "server",
      label: "Server / REST",
      tagline: "Any language — plain HTTP with a machine API key",
      sourceHref: `${REPO_URL}/blob/main/api/src/routes.ts`,
      steps: [
        {
          title: "Register a user",
          description:
            "externalUserId is your own stable identifier. Calling this again with the same id updates the record instead of creating a second one.",
          language: "bash",
          code: `curl -X POST ${baseUrl}/api/v1/users \\
  -H "X-API-Key: $NOTIFYX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "${appId}",
    "externalUserId": "user-123",
    "nickname": "Jane Doe",
    "phone": "+15551234567",
    "language": "en"
  }'`,
        },
        {
          title: "Register a device",
          description:
            "userId here is the NotifyX user id returned by the call above. Pass externalDeviceId so token rotation updates the same device.",
          language: "bash",
          code: `curl -X POST ${baseUrl}/api/v1/users/device \\
  -H "X-API-Key: $NOTIFYX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "<notifyx-user-id>",
    "platform": "android",
    "provider": "fcm",
    "pushToken": "<fcm-registration-token>",
    "externalDeviceId": "android-abc-123"
  }'`,
        },
        {
          title: "Send a notification",
          language: "bash",
          code: `curl -X POST ${baseUrl}/api/v1/notifications \\
  -H "X-API-Key: $NOTIFYX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "${appId}",
    "type": "transactional",
    "title": "Your order shipped",
    "body": "Track it in the app.",
    "userIds": ["user-123"],
    "tapActionType": "open_url",
    "actionUrl": "https://example.com/orders/A1023",
    "priority": "HIGH",
    "idempotencyKey": "order-A1023-shipped"
  }'`,
        },
        {
          title: "Fire an automation trigger",
          description:
            "Events drive the workflows you build under Automation — the payload is matched against each trigger's conditions.",
          language: "bash",
          code: `curl -X POST ${baseUrl}/api/v1/events/On%20Purchase \\
  -H "X-API-Key: $NOTIFYX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "${appId}",
    "externalUserId": "user-123",
    "payload": { "orderId": "A1023", "total": 59.99, "currency": "USD" }
  }'`,
        },
        {
          title: "Node.js, without an SDK",
          language: "javascript",
          code: `const NOTIFYX = "${baseUrl}/api/v1";

async function notify(externalUserId, title, body) {
  const res = await fetch(\`\${NOTIFYX}/notifications\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.NOTIFYX_API_KEY,
    },
    body: JSON.stringify({
      appId: "${appId}",
      type: "transactional",
      title,
      body,
      userIds: [externalUserId],
    }),
  });
  if (!res.ok) throw new Error(\`NotifyX \${res.status}: \${await res.text()}\`);
  return res.json();
}`,
        },
        {
          title: "Python, without an SDK",
          language: "python",
          code: `import os, requests

NOTIFYX = "${baseUrl}/api/v1"

def notify(external_user_id: str, title: str, body: str):
    r = requests.post(
        f"{NOTIFYX}/notifications",
        headers={"X-API-Key": os.environ["NOTIFYX_API_KEY"]},
        json={
            "appId": "${appId}",
            "type": "transactional",
            "title": title,
            "body": body,
            "userIds": [external_user_id],
        },
        timeout=10,
    )
    r.raise_for_status()
    return r.json()`,
        },
      ],
    },
  ];
}

export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  desc: string;
  auth: "api-key" | "admin";
}

/** Machine-facing surface — the endpoints an API key can actually reach. */
export const API_ENDPOINTS: ApiEndpoint[] = [
  { method: "POST", path: "/api/v1/users", desc: "Create or update a user", auth: "api-key" },
  { method: "POST", path: "/api/v1/users/device", desc: "Register or refresh a device token", auth: "api-key" },
  { method: "POST", path: "/api/v1/devices/heartbeat", desc: "Report device liveness (cheap; no provider traffic)", auth: "api-key" },
  { method: "PATCH", path: "/api/v1/devices/:id", desc: "Update a device", auth: "api-key" },
  { method: "POST", path: "/api/v1/devices/:id/activate", desc: "Reactivate a device", auth: "api-key" },
  { method: "POST", path: "/api/v1/notifications", desc: "Send a notification", auth: "api-key" },
  { method: "POST", path: "/api/v1/notifications/test", desc: "Send a test push to one device", auth: "api-key" },
  { method: "GET", path: "/api/v1/notifications/history", desc: "Delivery history for an app", auth: "api-key" },
  { method: "POST", path: "/api/v1/notifications/:id/cancel", desc: "Cancel a scheduled notification", auth: "api-key" },
  { method: "POST", path: "/api/v1/events/:eventName", desc: "Fire an automation trigger", auth: "api-key" },
  { method: "GET", path: "/api/v1/templates", desc: "List templates", auth: "api-key" },
];

/** Events NotifyX POSTs to your webhook URL. */
export const WEBHOOK_EVENTS = [
  { id: "notification.sent", desc: "Handed to the provider" },
  { id: "notification.delivered", desc: "Provider confirmed delivery" },
  { id: "notification.failed", desc: "Delivery failed — see failureCategory" },
  { id: "campaign.completed", desc: "Every recipient in a campaign was processed" },
  { id: "webhook.test", desc: "Sent by the simulator and the Test button" },
];
