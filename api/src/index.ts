/**
 * NotifyX API Server
 * Production-ready notification service
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { apiReference } from "@scalar/express-api-reference";
import { getOpenApiSpec } from "./docs/openapi";
import { errorHandler } from "./middleware/errorHandler";
import { authenticate } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import {
  sanitize,
  validateContentType,
  securityHeaders,
} from "./middleware/security";
import {
  prisma,
  checkDatabaseHealth,
  disconnectDatabase,
} from "./services/database";
import { checkRedisHealth, disconnectRedis } from "./services/redis";
import { closeQueues, getQueueHealth } from "./services/queue";
import { getConfiguredProviders } from "./services/push-providers";
import { validateEnv } from "./config/env";
import { sendSuccess } from "./utils/response";

// Load .env then validate — fail fast if config is bad
dotenv.config();
const env = validateEnv();

const app = express();
const port = env.PORT;

// Respect proxy headers only when explicitly configured
app.set("trust proxy", env.TRUST_PROXY);

// Re-export prisma for controllers (backward compatibility)
export { prisma };

// Security middleware (before everything else)
app.use(securityHeaders);

// Request ID + structured logging (before all route handlers)
import {
  requestId as requestIdMiddleware,
  requestLogger,
} from "./middleware/requestId";
app.use(requestIdMiddleware);
app.use(requestLogger);

// CORS — safe-by-default: reject wildcard in production
const corsOrigin =
  process.env.CORS_ORIGIN ||
  (process.env.NODE_ENV === "production" ? undefined : "*");
if (
  process.env.NODE_ENV === "production" &&
  (!corsOrigin || corsOrigin === "*")
) {
  console.warn(
    '[Security] CORS_ORIGIN is not set or is "*" in production. ' +
    "Requests with credentials will be rejected by browsers. " +
    "Set CORS_ORIGIN to your portal domain (e.g. https://portal.example.com).",
  );
}
app.use(
  cors({
    origin:
      corsOrigin === "*" ? true : corsOrigin?.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "X-API-Key",
      "Authorization",
      "X-Setup-Token",
    ],
    credentials: true,
    maxAge: 86400, // 24h preflight cache
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(validateContentType);
app.use(sanitize);

// Rate limiting
app.use(rateLimit());

// Authentication
app.use(authenticate);

// Tenant/org scoping — resolves accessible apps for admin users
import { resolveAccessibleApps } from "./middleware/tenantScope";
app.use(resolveAccessibleApps);

import { collectMetrics, getPrometheusMetrics } from "./services/metrics";

/**
 * Metrics auth guard — if MONITORING_TOKEN is set, require it via
 * Bearer token or ?token= query param.  Spec: "GET /metrics (optional token protected)."
 */
function metricsAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const monitoringToken = process.env.MONITORING_TOKEN;
  if (!monitoringToken) return next(); // no token configured → open

  const bearer = req.headers.authorization?.replace("Bearer ", "");
  const queryToken = req.query.token as string | undefined;

  if (bearer === monitoringToken || queryToken === monitoringToken) {
    return next();
  }

  res.status(401).json({
    error: true,
    message: "Monitoring token required",
    data: null,
  });
}

// Liveness endpoint (fast, no dependency checks)
app.get("/health", (req, res) => {
  sendSuccess(res, {
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

// Readiness endpoint (dependency checks)
app.get("/ready", async (req, res) => {
  const dbHealth = await checkDatabaseHealth();

  const redisHealth = env.REDIS_DISABLED
    ? { healthy: true, skipped: true }
    : await checkRedisHealth();

  let queueHealth:
    | Awaited<ReturnType<typeof getQueueHealth>>
    | { healthy: boolean; skipped?: true; error?: string };

  if (env.REDIS_DISABLED) {
    queueHealth = { healthy: true, skipped: true };
  } else {
    try {
      queueHealth = await getQueueHealth();
    } catch (error) {
      queueHealth = {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown queue error",
      };
    }
  }

  const queueReady =
    "healthy" in queueHealth
      ? queueHealth.healthy
      : Boolean(queueHealth.normal && queueHealth.high);
  const isReady = dbHealth.healthy && redisHealth.healthy && queueReady;

  sendSuccess(
    res,
    {
      status: isReady ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth,
        redis: redisHealth,
        queues: queueHealth,
      },
      providers: getConfiguredProviders(),
    },
    isReady ? 200 : 503,
    isReady ? "Ready" : "Not Ready",
  );
});

// Metrics endpoint (for dashboards) — token protected
app.get("/metrics", metricsAuth, async (req, res) => {
  try {
    const metrics = await collectMetrics();
    sendSuccess(res, metrics);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: "Failed to collect metrics",
      data: null,
    });
  }
});

// Prometheus metrics endpoint — token protected
app.get("/metrics/prometheus", metricsAuth, async (req, res) => {
  try {
    const metrics = await getPrometheusMetrics();
    res.set("Content-Type", "text/plain");
    res.send(metrics);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: "Error collecting metrics",
      data: null,
    });
  }
});

import {
  appRouter,
  userRouter,
  deviceRouter,
  notificationRouter,
  eventRouter,
  templateRouter,
  adminRouter,
  statsRouter,
  abTestRouter,
  campaignRouter,
  auditRouter,
  uploadRouter,
  assetRouter,
  orgRouter,
  automationRouter,
  automationTriggerRouter,
} from "./routes";

// Documentation (no auth required - handled in authenticate middleware)
app.get("/openapi.json", (req, res) => {
  res.json(getOpenApiSpec());
});
app.use(
  "/docs",
  apiReference({
    spec: {
      url: "/openapi.json",
    },
  } as any),
);
app.use(
  "/reference",
  apiReference({
    spec: {
      url: "/openapi.json",
    },
  } as any),
);

// Routes — versioned under /api/v1 per spec
import { Router } from "express";
const v1 = Router();

v1.use("/admin", adminRouter); // Admin portal routes
v1.use("/orgs", orgRouter); // Organization & RBAC routes
v1.use("/uploads", uploadRouter); // File upload routes
v1.use("/stats", statsRouter); // Stats routes (admin portal)
v1.use("/audit", auditRouter); // Audit log routes (super admin only)
v1.use("/apps", appRouter);
v1.use("/users", userRouter);
v1.use("/devices", deviceRouter);
v1.use("/notifications", notificationRouter);
v1.use("/events", eventRouter);
v1.use("/templates", templateRouter);
v1.use("/automations", automationRouter);
v1.use("/automation-triggers", automationTriggerRouter);
v1.use("/ab-tests", abTestRouter); // A/B testing routes
v1.use("/campaigns", campaignRouter); // Bulk campaign routes
if (process.env.NODE_ENV !== "production") {
  v1.use("/assets", assetRouter); // Asset routes (machine support - dev only)
}

// Mount versioned API
app.use("/api/v1", v1);

// Global Error Handler
app.use(errorHandler);

// Start server
const server = app.listen(port, () => {
  console.log(`[API] Server running on http://localhost:${port}`);
  console.log(`[API] Docs available at http://localhost:${port}/reference`);
  console.log(
    `[API] Redis queues: ${env.REDIS_DISABLED ? "DISABLED (REDIS_DISABLED=true)" : "ENABLED"}`,
  );
  console.log(
    `[API] Configured providers: ${getConfiguredProviders().join(", ") || "none"}`,
  );
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n[API] Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log("[API] HTTP server closed");

    try {
      // Close queues
      await closeQueues();

      // Disconnect from Redis
      await disconnectRedis();

      // Disconnect from database
      await disconnectDatabase();

      console.log("[API] Graceful shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("[API] Error during shutdown:", error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error("[API] Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[API] Uncaught Exception:", error);
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[API] Unhandled Rejection:", reason);
});

export default app;
