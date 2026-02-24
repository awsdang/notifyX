import crypto from "crypto";
import { prisma } from "./database";

export function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = signPayload(payload, secret);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Hash a webhook secret for storage.
 * The raw secret is returned to the client only once on create/rotate.
 */
export function hashWebhookSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export async function rotateWebhookSecret(
  webhookId: string,
  adminUserId: string,
): Promise<string> {
  const newSecret = crypto.randomBytes(32).toString("hex");
  const hashedSecret = hashWebhookSecret(newSecret);

  await prisma.webhookEndpoint.update({
    where: { id: webhookId },
    data: { secret: hashedSecret },
  });

  await prisma.auditLog.create({
    data: {
      action: "WEBHOOK_SECRET_ROTATED",
      resource: "webhook_endpoint",
      resourceId: webhookId,
      adminUserId,
      details: {},
    },
  });

  // Return the RAW secret (only time it's visible)
  return newSecret;
}

export async function testWebhook(
  url: string,
  secret: string,
): Promise<{ success: boolean; status: number; body?: string }> {
  const payload = JSON.stringify({
    event: "ping",
    timestamp: new Date().toISOString(),
  });
  const signature = signPayload(payload, secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-NotifyX-Signature": signature,
        "Content-Type": "application/json",
        "User-Agent": "NotifyX-Webhook-Tester/1.0",
      },
      body: payload,
      signal: controller.signal,
    });

    const body = await response.text();
    return { success: response.ok, status: response.status, body };
  } catch (error: any) {
    return {
      success: false,
      status: 0,
      body: error.message || "Network error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
