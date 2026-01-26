/**
 * NotifyX Worker Process
 * Dedicated process for background notification processing
 */

import dotenv from 'dotenv';
import { initWorker, shutdownWorkers } from './workers/notification';
import { checkRedisHealth, disconnectRedis } from './services/redis';
import { checkDatabaseHealth, disconnectDatabase } from './services/database';
import { closeQueues } from './services/queue';

dotenv.config();

console.log('[Worker] Starting process...');

async function start() {
    try {
        // Check connectivity
        const [dbHealth, redisHealth] = await Promise.all([
            checkDatabaseHealth(),
            checkRedisHealth(),
        ]);

        if (!dbHealth.healthy || !redisHealth.healthy) {
            console.error('[Worker] Health check failed, exiting...');
            process.exit(1);
        }

        // Initialize workers
        initWorker();

        console.log('[Worker] Process ready and listening for jobs');
    } catch (error) {
        console.error('[Worker] Initialization failed:', error);
        process.exit(1);
    }
}

// Graceful shutdown
const shutdown = async (signal: string) => {
    console.log(`\n[Worker] Received ${signal}, starting graceful shutdown...`);

    try {
        await shutdownWorkers();
        await closeQueues();
        await disconnectRedis();
        await disconnectDatabase();

        console.log('[Worker] Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('[Worker] Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
