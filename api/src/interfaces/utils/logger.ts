export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    service: string;
    metadata?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}
