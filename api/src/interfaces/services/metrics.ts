export interface Metrics {
    timestamp: string;
    uptime: number;
    memory: {
        used: number;
        total: number;
        percentage: number;
    };
    notifications: {
        total: number;
        sent: number;
        failed: number;
        queued: number;
        today: number;
    };
    deliveries: {
        total: number;
        delivered: number;
        failed: number;
        pending: number;
        successRate: number;
    };
    queues: {
        normal: { waiting: number; active: number; failed: number };
        high: { waiting: number; active: number; failed: number };
    };
    apps: number;
    users: number;
    devices: {
        total: number;
        active: number;
    };
    dlq: {
        unprocessed: number;
    };
}
