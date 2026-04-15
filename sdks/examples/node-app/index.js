/**
 * NotifyX Node.js Integration Example
 *
 * Demonstrates:
 * 1. Receiving webhook callbacks from NotifyX
 * 2. Firing automation trigger events
 * 3. Registering a user + device
 * 4. Sending a notification via API
 *
 * Usage:
 *   NOTIFYX_URL=http://localhost:3000/api/v1 NOTIFYX_API_KEY=your_key node index.js
 */

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const NOTIFYX_URL = (process.env.NOTIFYX_URL || "http://localhost:3000/api/v1").replace(/\/$/, "");
const API_KEY = process.env.NOTIFYX_API_KEY || "";
const WEBHOOK_SECRET = process.env.NOTIFYX_WEBHOOK_SECRET || "";
const PORT = process.env.PORT || 4000;

// Helper: make authenticated requests to NotifyX API
async function notifyxFetch(path, options = {}) {
  const res = await fetch(`${NOTIFYX_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

// ──────────────────────────────────────────────
// 1. Webhook Receiver — Verify signature & log
// ──────────────────────────────────────────────
app.post("/webhooks/notifyx", (req, res) => {
  // Verify HMAC-SHA256 signature if secret is configured
  if (WEBHOOK_SECRET) {
    const signature = req.headers["x-notifyx-signature"];
    const expected = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (signature !== expected) {
      console.warn("[webhook] Invalid signature — rejecting");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  console.log("[webhook] Received event:", req.body.event);
  console.log("[webhook] Payload:", JSON.stringify(req.body, null, 2));

  res.json({ received: true });
});

// ──────────────────────────────────────────────
// 2. Fire an automation trigger event
// ──────────────────────────────────────────────
app.post("/fire-event", async (req, res) => {
  const { eventName, appId, userId, payload } = req.body;

  if (!eventName || !appId) {
    return res.status(400).json({ error: "eventName and appId are required" });
  }

  const result = await notifyxFetch(`/events/${eventName}`, {
    method: "POST",
    body: JSON.stringify({
      appId,
      externalUserId: userId || "demo-user",
      payload: payload || {},
    }),
  });

  console.log(`[event] Fired ${eventName} — status ${result.status}`);
  res.json(result.body);
});

// ──────────────────────────────────────────────
// 3. Register a user + device
// ──────────────────────────────────────────────
app.post("/register-device", async (req, res) => {
  const { appId, userId, pushToken, platform, language } = req.body;

  if (!appId || !userId || !pushToken || !platform) {
    return res.status(400).json({ error: "appId, userId, pushToken, and platform are required" });
  }

  const result = await notifyxFetch("/devices", {
    method: "POST",
    body: JSON.stringify({
      appId,
      externalUserId: userId,
      pushToken,
      platform,
      language: language || "en",
    }),
  });

  console.log(`[device] Registered ${platform} device for ${userId} — status ${result.status}`);
  res.json(result.body);
});

// ──────────────────────────────────────────────
// 4. Send a notification
// ──────────────────────────────────────────────
app.post("/send-notification", async (req, res) => {
  const { appId, userIds, title, body: notifBody, imageUrl } = req.body;

  if (!appId || !userIds?.length || !title) {
    return res.status(400).json({ error: "appId, userIds, and title are required" });
  }

  const result = await notifyxFetch("/notifications", {
    method: "POST",
    body: JSON.stringify({
      appId,
      userIds,
      title,
      body: notifBody || "",
      imageUrl: imageUrl || undefined,
    }),
  });

  console.log(`[notification] Sent to ${userIds.length} user(s) — status ${result.status}`);
  res.json(result.body);
});

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nNotifyX Node.js Example running on http://localhost:${PORT}`);
  console.log(`API: ${NOTIFYX_URL}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /webhooks/notifyx  — Receive NotifyX webhook callbacks`);
  console.log(`  POST /fire-event        — Fire an automation trigger`);
  console.log(`  POST /register-device   — Register a user + device`);
  console.log(`  POST /send-notification — Send a push notification\n`);
});
