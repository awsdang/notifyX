/**
 * Structured Logging Service
 * Production-ready logging with levels and metadata
 */

import type { LogLevel, LogEntry } from '../interfaces/utils/logger';

export type { LogLevel, LogEntry };

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

class Logger {
    private service: string;
    private minLevel: LogLevel;

    constructor(service: string = 'api') {
        this.service = service;
        this.minLevel = (process.env.LOG_LEVEL as LogLevel) ||
            (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
    }

    private formatLog(level: LogLevel, message: string, metadata?: Record<string, unknown>, error?: Error): void {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            service: this.service,
            metadata,
        };

        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }

        // In production, output as JSON for log aggregation (CloudWatch, Datadog, etc.)
        if (process.env.NODE_ENV === 'production') {
            console.log(JSON.stringify(entry));
        } else {
            // Development: human-readable format
            const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.service}]`;
            if (error) {
                console[level === 'error' ? 'error' : 'log'](`${prefix} ${message}`, metadata || '', error);
            } else {
                console.log(`${prefix} ${message}`, metadata ? JSON.stringify(metadata) : '');
            }
        }
    }

    debug(message: string, metadata?: Record<string, unknown>): void {
        this.formatLog('debug', message, metadata);
    }

    info(message: string, metadata?: Record<string, unknown>): void {
        this.formatLog('info', message, metadata);
    }

    warn(message: string, metadata?: Record<string, unknown>): void {
        this.formatLog('warn', message, metadata);
    }

    error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
        this.formatLog('error', message, metadata, error);
    }

    // Create child logger with additional context
    child(context: Record<string, unknown>): ChildLogger {
        return new ChildLogger(this, context);
    }
}

class ChildLogger {
    private parent: Logger;
    private context: Record<string, unknown>;

    constructor(parent: Logger, context: Record<string, unknown>) {
        this.parent = parent;
        this.context = context;
    }

    debug(message: string, metadata?: Record<string, unknown>): void {
        this.parent.debug(message, { ...this.context, ...metadata });
    }

    info(message: string, metadata?: Record<string, unknown>): void {
        this.parent.info(message, { ...this.context, ...metadata });
    }

    warn(message: string, metadata?: Record<string, unknown>): void {
        this.parent.warn(message, { ...this.context, ...metadata });
    }

    error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
        this.parent.error(message, error, { ...this.context, ...metadata });
    }
}

// Export singleton instance
export const logger = new Logger('api');

// Create service-specific loggers
export const workerLogger = new Logger('worker');
export const queueLogger = new Logger('queue');
export const dbLogger = new Logger('database');
