export interface Application {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface Stats {
    notifications: {
        total: number;
        thisWeek: number;
        thisMonth: number;
        pending: number;
    };
    delivery: {
        successRate: number;
    };
    resources: {
        devices: number;
        apps: number;
    };
}

export interface Campaign {
    id: string;
    appId: string;
    name: string;
    description?: string;
    status: 'DRAFT' | 'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
    targetingMode: 'ALL' | 'USER_LIST' | 'CSV';
    totalTargets: number;
    processedCount: number;
    title: string;
    subtitle?: string;
    body: string;
    image?: string;
    scheduledAt?: string;
    startedAt?: string;
    completedAt?: string;
    sentCount: number;
    deliveredCount: number;
    failedCount: number;
    priority: string;
    createdAt: string;
}

export interface Credential {
    id: string;
    provider: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
