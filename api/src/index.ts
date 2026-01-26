/**
 * NotifyX API Server
 * Production-ready notification service
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { apiReference } from '@scalar/express-api-reference';
import { getOpenApiSpec } from './docs/openapi';
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { sanitize, validateContentType, securityHeaders } from './middleware/security';
import { prisma, checkDatabaseHealth, disconnectDatabase } from './services/database';
import { checkRedisHealth, disconnectRedis } from './services/redis';
import { closeQueues, getQueueHealth } from './services/queue';
import { getConfiguredProviders } from './services/push-providers';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Re-export prisma for controllers (backward compatibility)
export { prisma };

import { initWorker, shutdownWorkers } from './workers/notification';
import { startScheduler, stopScheduler } from './workers/scheduler';

// Security middleware (before everything else)
app.use(securityHeaders);
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(validateContentType);
app.use(sanitize);

// Rate limiting
app.use(rateLimit());

// Authentication
app.use(authenticate);

// Start Worker
initWorker();

// Start Scheduler (polls for scheduled notifications, campaigns, A/B tests)
startScheduler();

import { collectMetrics, getPrometheusMetrics } from './services/metrics';

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
    const [dbHealth, redisHealth, queueHealth] = await Promise.all([
        checkDatabaseHealth(),
        checkRedisHealth(),
        getQueueHealth(),
    ]);

    const isHealthy = dbHealth.healthy && redisHealth.healthy;
    const providers = getConfiguredProviders();

    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
            database: dbHealth,
            redis: redisHealth,
            queues: queueHealth,
        },
        providers: providers,
    });
});

// Metrics endpoint (for dashboards)
app.get('/metrics', async (req, res) => {
    try {
        const metrics = await collectMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to collect metrics' });
    }
});

// Prometheus metrics endpoint
app.get('/metrics/prometheus', async (req, res) => {
    try {
        const metrics = await getPrometheusMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        res.status(500).send('# Error collecting metrics');
    }
});

import { appRouter, userRouter, deviceRouter, notificationRouter, eventRouter, templateRouter, adminRouter, statsRouter, abTestRouter, campaignRouter, auditRouter, uploadRouter, orgRouter } from './routes';

// Documentation (no auth required - handled in authenticate middleware)
app.get('/openapi.json', (req, res) => {
    res.json(getOpenApiSpec());
});
app.use('/reference', apiReference({
    spec: {
        url: '/openapi.json',
    },
} as any));

// Routes
app.use('/admin', adminRouter);  // Admin portal routes
app.use('/orgs', orgRouter);     // Organization & RBAC routes
app.use('/uploads', uploadRouter); // File upload routes
app.use('/stats', statsRouter);  // Stats routes (admin portal)
app.use('/audit', auditRouter);  // Audit log routes (super admin only)
app.use('/apps', appRouter);
app.use('/users', userRouter);
app.use('/devices', deviceRouter);
app.use('/notifications', notificationRouter);
app.use('/events', eventRouter);
app.use('/templates', templateRouter);
app.use('/ab-tests', abTestRouter);  // A/B testing routes
app.use('/campaigns', campaignRouter);  // Bulk campaign routes

// Global Error Handler
app.use(errorHandler);

// Start server
const server = app.listen(port, () => {
    console.log(`[API] Server running on http://localhost:${port}`);
    console.log(`[API] Docs available at http://localhost:${port}/reference`);
    console.log(`[API] Configured providers: ${getConfiguredProviders().join(', ') || 'none'}`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
    console.log(`\n[API] Received ${signal}, starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
        console.log('[API] HTTP server closed');

        try {
            // Stop scheduler first
            stopScheduler();

            // Shutdown workers (let them finish current jobs)
            await shutdownWorkers();

            // Close queues
            await closeQueues();

            // Disconnect from Redis
            await disconnectRedis();

            // Disconnect from database
            await disconnectDatabase();

            console.log('[API] Graceful shutdown complete');
            process.exit(0);
        } catch (error) {
            console.error('[API] Error during shutdown:', error);
            process.exit(1);
        }
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('[API] Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('[API] Uncaught Exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    console.error('[API] Unhandled Rejection:', reason);
});

export default app;
