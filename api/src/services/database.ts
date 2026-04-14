/**
 * Database Client with Connection Pooling
 * Singleton pattern with proper lifecycle management
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Extend PrismaClient for metrics if needed
const createPrismaClient = () => {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'production'
            ? ['error', 'warn']
            : ['query', 'info', 'warn', 'error'],
    });
};

// Global singleton to prevent multiple instances
declare global {
    // eslint-disable-next-line no-var
    var __prisma: PrismaClient | undefined;
}

// Use global variable in development/test to prevent hot-reload issues
export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
    global.__prisma = prisma;
}

// Health check function
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        return { healthy: true, latency: Date.now() - start };
    } catch (error) {
        return {
            healthy: false,
            latency: Date.now() - start,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Graceful disconnect
export async function disconnectDatabase(): Promise<void> {
    await prisma.$disconnect();
    console.log('[DB] Disconnected from database');
}
