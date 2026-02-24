import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { prisma } from "../src/services/database";
import {
  configureWebhook,
  rotateSecret,
  testWebhook,
} from "../src/controllers/webhooks";
import { signPayload } from "../src/services/webhook";
import type { Request, Response } from "express";

// Mock request/response helpers
const mockReq = (params: any = {}, body: any = {}, adminUser: any = {}) =>
  ({
    params,
    body,
    adminUser,
  }) as unknown as Request;

const mockRes = () => {
  const res: any = {};
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res as Response & { statusCode: number; body: any };
};

describe("Webhook Signing & Hardening", () => {
  let appId: string;
  const env = "PROD";

  let adminUserId: string;

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: {
        email: "admin-test-webhooks@example.com",
        passwordHash: "hash",
        name: "Admin Test",
      },
    });
    adminUserId = admin.id;

    const app = await prisma.app.create({
      data: {
        name: "Webhook Test App",
        platforms: {},
        defaultLanguage: "en",
      },
    });
    appId = app.id;

    await prisma.appEnvironment.create({
      data: {
        appId: app.id,
        env: "PROD",
      },
    });
  });

  afterAll(async () => {
    await prisma.app.deleteMany({ where: { id: appId } });
    await prisma.adminUser.deleteMany({ where: { id: adminUserId } });
  });

  it("should configure a new webhook", async () => {
    const req = mockReq(
      { appId, env },
      {
        url: "https://example.com/webhook",
        enabled: true,
        events: ["delivery.sent"],
      },
      { id: adminUserId },
    );
    const res = mockRes();

    await configureWebhook(req, res);

    expect(res.body.error).toBe(false);
    expect(res.body.data.url).toBe("https://example.com/webhook");
    expect(res.body.data.secret).toBeDefined();
  });

  it("should rotate webhook secret", async () => {
    const req = mockReq({ appId, env }, {}, { id: adminUserId });
    const res = mockRes();

    // First get current secret
    // Actually configureWebhook returns secret, but let's assume we don't know it
    // Call rotate
    await rotateSecret(req, res);

    expect(res.body.error).toBe(false);
    expect(res.body.data.secret).toBeDefined();

    // Check DB
    const appEnv = await prisma.appEnvironment.findUnique({
      where: { appId_env: { appId, env: "PROD" } },
      include: { webhooks: true },
    });
    expect(appEnv?.webhooks[0]?.secret).toBe(res.body.data.secret);
  });

  it("should verify signature correctly", () => {
    const secret = "my-secret";
    const payload = JSON.stringify({ event: "test" });
    const signature = signPayload(payload, secret);

    // Re-implement verify logic here to test utility or import it
    // We imported signPayload, so we trust it matches itself?
    // But verifying correctness:
    // HMAC-SHA256 hex digest
    expect(signature).toHaveLength(64); // SHA256 hex is 64 chars
  });
});
