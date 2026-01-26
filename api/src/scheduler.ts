/**
 * NotifyX Scheduler Process
 * Dedicated process for polling scheduled jobs and managing lifecycle
 */

import dotenv from 'dotenv';
import { startScheduler, stopScheduler } from './workers/scheduler';
import { checkRedisHealth, disconnectRedis } from './services/redis';
import { checkDatabaseHealth, disconnectDatabase } from './services/database';
import { closeQueues } from './services/queue';

dotenv.config();

console.log('[Scheduler] Starting process...');

async function start() {
    try {
        // Check connectivity
        const [dbHealth, redisHealth] = await Promise.all([
            checkDatabaseHealth(),
            checkRedisHealth(),
        ]);

        if (!dbHealth.healthy || !redisHealth.healthy) {
            console.error('[Scheduler] Health check failed, exiting...');
            process.exit(1);
        }

        // Start Scheduler
        startScheduler();

        console.log('[Scheduler] Process ready and polling for work');
    } catch (error) {
        console.error('[Scheduler] Initialization failed:', error);
        process.exit(1);
    }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
    console.log(`\n[Scheduler] Received ${signal}, starting graceful shutdown...`);

    try {
        stopScheduler();
        await closeQueues();
        await disconnectRedis();
        await disconnectDatabase();

        console.log('[Scheduler] Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('[Scheduler] Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
