/**
 * Step-by-step guides for obtaining the credentials each push provider needs.
 *
 * The content mirrors the field names in `credentials/ProviderIcon.tsx`
 * (PROVIDER_INFO), so what an operator collects here maps 1:1 onto the form
 * they fill in under Credentials.
 */

export interface SetupStep {
  title: string;
  detail: string;
  /** Where to do it — console URL. */
  href?: string;
}

export interface ProviderGuide {
  key: "apns" | "fcm" | "web" | "hms";
  name: string;
  subtitle: string;
  platforms: string[];
  /** Console the credentials come from. */
  console: { label: string; href: string };
  steps: SetupStep[];
  /** NotifyX credential fields this produces. */
  fields: { key: string; label: string; from: string }[];
  gotchas: string[];
}

export const PROVIDER_GUIDES: ProviderGuide[] = [
  {
    key: "apns",
    name: "Apple Push Notification service",
    subtitle: "iOS, iPadOS, macOS and Safari web push",
    platforms: ["iOS", "macOS", "Safari"],
    console: {
      label: "Apple Developer → Certificates, Identifiers & Profiles",
      href: "https://developer.apple.com/account/resources/authkeys/list",
    },
    steps: [
      {
        title: "Enrol in the Apple Developer Program",
        detail:
          "Push notifications require a paid membership ($99/yr). A free personal team cannot create push keys.",
        href: "https://developer.apple.com/programs/",
      },
      {
        title: "Create a Key with APNs enabled",
        detail:
          "Keys → + → tick 'Apple Push Notifications service (APNs)' → Continue → Register. Download the .p8 file. Apple lets you download it exactly once — losing it means revoking and starting over.",
        href: "https://developer.apple.com/account/resources/authkeys/list",
      },
      {
        title: "Note the Key ID",
        detail:
          "Shown on the key's detail page and embedded in the filename: AuthKey_ABC123DEFG.p8 → Key ID is ABC123DEFG.",
      },
      {
        title: "Find your Team ID",
        detail:
          "Membership details page, or the top-right of the developer portal. Ten alphanumeric characters.",
        href: "https://developer.apple.com/account#MembershipDetailsCard",
      },
      {
        title: "Confirm the app's Bundle ID",
        detail:
          "Identifiers → your App ID. Must match the bundle identifier in Xcode exactly, and 'Push Notifications' must be ticked as a capability.",
      },
      {
        title: "Paste into NotifyX",
        detail:
          "Credentials → your app → Add provider → Apple. Open the .p8 in a text editor and paste the whole block, including the BEGIN/END lines.",
      },
    ],
    fields: [
      { key: "keyId", label: "Key ID", from: "Key detail page / .p8 filename" },
      { key: "teamId", label: "Team ID", from: "Membership details" },
      { key: "bundleId", label: "Bundle ID", from: "Identifiers → App ID" },
      { key: "privateKey", label: "Private Key", from: "Contents of AuthKey_*.p8" },
      { key: "production", label: "Production", from: "On for App Store / TestFlight builds" },
    ],
    gotchas: [
      "A token-based .p8 key works for every app under the same Team ID — you do not need one per app.",
      "Development builds from Xcode get sandbox tokens. Leave 'Production' off for those, on for TestFlight and App Store builds; a token sent to the wrong environment fails with BadDeviceToken.",
      "Safari web push needs a separate Website Push ID, not the app's bundle ID.",
    ],
  },
  {
    key: "fcm",
    name: "Firebase Cloud Messaging",
    subtitle: "Android, and Chrome/Edge/Firefox web push",
    platforms: ["Android", "Web"],
    console: {
      label: "Firebase Console → Project settings → Service accounts",
      href: "https://console.firebase.google.com/",
    },
    steps: [
      {
        title: "Create (or open) a Firebase project",
        detail:
          "One project can serve Android, iOS and Web. Free Spark tier is enough for push.",
        href: "https://console.firebase.google.com/",
      },
      {
        title: "Register your Android app",
        detail:
          "Project settings → Your apps → Add app → Android. Enter the package name exactly as in your app's build.gradle applicationId, then download google-services.json into android/app/.",
      },
      {
        title: "Generate a service account key",
        detail:
          "Project settings → Service accounts → 'Generate new private key' → Generate key. A JSON file downloads; it contains project_id, client_email and private_key.",
      },
      {
        title: "Paste into NotifyX",
        detail:
          "Credentials → your app → Add provider → Firebase. Copy project_id, client_email and private_key straight out of that JSON. Keep the \\n escapes in the private key intact.",
      },
      {
        title: "Confirm the API is enabled",
        detail:
          "FCM v1 needs the 'Firebase Cloud Messaging API' enabled on the underlying Google Cloud project. New projects have it on by default; older ones may not.",
        href: "https://console.cloud.google.com/apis/library/fcm.googleapis.com",
      },
    ],
    fields: [
      { key: "projectId", label: "Project ID", from: "project_id in the service account JSON" },
      { key: "clientEmail", label: "Client Email", from: "client_email in the JSON" },
      { key: "privateKey", label: "Private Key", from: "private_key in the JSON" },
    ],
    gotchas: [
      "Use the service account JSON, not the legacy server key — legacy FCM was shut down and those keys no longer authenticate.",
      "The service account JSON is a full credential for the project. Never commit it or ship it in a client build.",
      "Android 13+ requires runtime POST_NOTIFICATIONS permission — a valid credential alone will not make notifications appear.",
    ],
  },
  {
    key: "web",
    name: "Web Push (VAPID)",
    subtitle: "Browser push via the standard Push API",
    platforms: ["Chrome", "Edge", "Firefox", "Safari 16.4+"],
    console: {
      label: "Generated inside NotifyX — no external console",
      href: "https://developer.mozilla.org/en-US/docs/Web/API/Push_API",
    },
    steps: [
      {
        title: "Generate a VAPID key pair",
        detail:
          "Credentials → your app → Add provider → Web Push → 'Generate VAPID keys'. NotifyX creates the pair and stores the private half encrypted; the public half goes in your web client.",
      },
      {
        title: "Set a subject",
        detail:
          "A mailto: or https: URL identifying you to the push service, e.g. mailto:alerts@yourcompany.com. Push services use it to contact you about abuse.",
      },
      {
        title: "List your allowed origins",
        detail:
          "Every origin that will call the SDK — https://app.example.com. This drives the CORS allow-list; an origin that is missing gets blocked at the browser.",
      },
      {
        title: "Host the service worker",
        detail:
          "Copy sdks/web/notifyx-sw.js to the root of that same origin so it is reachable at /notifyx-sw.js. Push cannot work from a different origin or a subdirectory scope.",
      },
      {
        title: "Serve over HTTPS",
        detail:
          "The Push API requires a secure context. http://localhost is treated as secure for development; any other plain-HTTP origin is not.",
      },
    ],
    fields: [
      { key: "vapidPublicKey", label: "VAPID Public Key", from: "Generated in NotifyX — also goes in your web client" },
      { key: "vapidPrivateKey", label: "VAPID Private Key", from: "Generated in NotifyX — never leaves the server" },
      { key: "subject", label: "Subject", from: "Your mailto: or https: contact URL" },
      { key: "allowedOrigins", label: "Allowed Origins", from: "Origins that host your web app" },
    ],
    gotchas: [
      "Regenerating the key pair invalidates every existing browser subscription — they all have to re-subscribe.",
      "iOS Safari only delivers web push to sites the user has added to the Home Screen.",
      "A successful /users registration is not proof push works — the service worker registration and Push API subscription must also succeed.",
    ],
  },
  {
    key: "hms",
    name: "Huawei Push Kit",
    subtitle: "Huawei devices without Google Play Services",
    platforms: ["Huawei / HarmonyOS"],
    console: {
      label: "AppGallery Connect → My projects",
      href: "https://developer.huawei.com/consumer/en/service/josp/agc/index.html",
    },
    steps: [
      {
        title: "Create a Huawei developer account",
        detail:
          "Requires identity verification (individual or enterprise), which Huawei reviews manually — budget a day or two.",
        href: "https://developer.huawei.com/consumer/en/",
      },
      {
        title: "Create a project and add an app",
        detail:
          "AppGallery Connect → My projects → Add project → Add app. The package name must match your Android applicationId.",
      },
      {
        title: "Enable Push Kit",
        detail:
          "Project settings → Grow → Push Kit → Enable now. Push Kit is off until you explicitly switch it on.",
      },
      {
        title: "Copy the App ID and App Secret",
        detail:
          "Project settings → General information → App information. These are the OAuth client credentials NotifyX uses to mint push tokens.",
      },
      {
        title: "Download agconnect-services.json",
        detail:
          "Same page. Drop it into android/app/ alongside (not instead of) google-services.json if you ship both stores.",
      },
      {
        title: "Paste into NotifyX",
        detail:
          "Credentials → your app → Add provider → Huawei. App ID and App Secret are all NotifyX needs.",
      },
    ],
    fields: [
      { key: "appId", label: "App ID", from: "AGC → General information" },
      { key: "appSecret", label: "App Secret", from: "AGC → General information" },
    ],
    gotchas: [
      "A signing certificate SHA-256 fingerprint must be registered in AGC or push registration fails on device.",
      "Huawei devices made before 2020 may still have Google Play Services — check which token the device returns and register it against the matching provider.",
      "Push Kit quotas are per-app and reset daily; sustained bulk sends need a quota increase request.",
    ],
  },
];
