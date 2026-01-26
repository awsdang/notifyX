/**
 * Test Setup and Utilities
 * Provides HTTP client, authentication helpers, and cleanup utilities
 */

const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';

// Test API key - should match one in API_KEYS env var
export const TEST_API_KEY = process.env.TEST_API_KEY || 'test-api-key-for-development';

// ============================================================
// HTTP Client Helpers
// ============================================================

export interface RequestOptions {
    headers?: Record<string, string>;
    body?: unknown;
    token?: string;  // For admin auth (session token)
    apiKey?: string; // For API key auth
}

export interface ApiResponse<T = unknown> {
    ok: boolean;
    status: number;
    data: T;
}

async function request<T = unknown>(
    method: string,
    path: string,
    options: RequestOptions = {}
): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
    }

    // Use API key for service-to-service auth (default in tests)
    if (options.apiKey !== undefined) {
        if (options.apiKey) {
            headers['X-API-Key'] = options.apiKey;
        }
    } else {
        // Default to test API key
        headers['X-API-Key'] = TEST_API_KEY;
    }

    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    return {
        ok: response.ok,
        status: response.status,
        data: data as T,
    };
}

export const http = {
    get: <T = unknown>(path: string, options?: RequestOptions) =>
        request<T>('GET', path, options),
    post: <T = unknown>(path: string, options?: RequestOptions) =>
        request<T>('POST', path, options),
    put: <T = unknown>(path: string, options?: RequestOptions) =>
        request<T>('PUT', path, options),
    patch: <T = unknown>(path: string, options?: RequestOptions) =>
        request<T>('PATCH', path, options),
    delete: <T = unknown>(path: string, options?: RequestOptions) =>
        request<T>('DELETE', path, options),
};

// ============================================================
// Test Data Factories
// ============================================================

let counter = 0;
const uniqueId = () => `test_${Date.now()}_${++counter}`;

export const factory = {
    app: (overrides: Record<string, unknown> = {}) => ({
        name: `TestApp_${uniqueId()}`,
        platforms: { web: true, ios: false, android: false },
        defaultLanguage: 'en',
        ...overrides,
    }),

    user: (overrides: Record<string, unknown> = {}) => ({
        externalUserId: uniqueId(),
        language: 'en',
        timezone: 'UTC',
        ...overrides,
    }),

    device: (userId: string, appId: string, overrides: Record<string, unknown> = {}) => ({
        userId,
        platform: 'android' as const,
        pushToken: `token_${uniqueId()}`,
        provider: 'fcm' as const,
        ...overrides,
    }),

    template: (appId: string, overrides: Record<string, unknown> = {}) => ({
        appId,
        type: 'transactional',
        eventName: `event_${uniqueId()}`,
        language: 'en',
        title: 'Test Title {{name}}',
        body: 'Test Body {{message}}',
        variables: ['name', 'message'],
        ...overrides,
    }),

    notification: (appId: string, overrides: Record<string, unknown> = {}) => ({
        appId,
        type: 'transactional',
        title: 'Test Notification',
        body: 'Test body content',
        priority: 'NORMAL',
        userIds: [`user_${uniqueId()}`],
        ...overrides,
    }),

    campaign: (appId: string, overrides: Record<string, unknown> = {}) => ({
        appId,
        name: `Campaign_${uniqueId()}`,
        title: 'Campaign Title',
        body: 'Campaign Body',
        priority: 'NORMAL',
        ...overrides,
    }),

    abTest: (appId: string, overrides: Record<string, unknown> = {}) => ({
        appId,
        name: `ABTest_${uniqueId()}`,
        variants: [
            { name: 'Control', title: 'Control Title', body: 'Control Body', weight: 50 },
            { name: 'Variant A', title: 'Variant Title', body: 'Variant Body', weight: 50 },
        ],
        ...overrides,
    }),
};

// ============================================================
// Cleanup Utilities
// ============================================================

interface CleanupItem {
    type: 'app' | 'user' | 'template' | 'campaign' | 'abtest';
    id: string;
    appId?: string;
}

const cleanupQueue: CleanupItem[] = [];

export const cleanup = {
    track: (type: CleanupItem['type'], id: string, appId?: string) => {
        cleanupQueue.push({ type, id, appId });
    },

    trackApp: (id: string) => cleanup.track('app', id),
    trackUser: (id: string) => cleanup.track('user', id),
    trackTemplate: (id: string) => cleanup.track('template', id),
    trackCampaign: (id: string) => cleanup.track('campaign', id),
    trackABTest: (id: string) => cleanup.track('abtest', id),

    runAll: async (token?: string) => {
        // Cleanup in reverse order (templates/campaigns before apps)
        const items = [...cleanupQueue].reverse();
        cleanupQueue.length = 0;

        for (const item of items) {
            try {
                switch (item.type) {
                    case 'template':
                        await http.delete(`/templates/${item.id}`, { token });
                        break;
                    case 'campaign':
                        await http.delete(`/campaigns/${item.id}`, { token });
                        break;
                    case 'abtest':
                        await http.delete(`/ab-tests/${item.id}`, { token });
                        break;
                    case 'user':
                        await http.delete(`/users/${item.id}`, { token });
                        break;
                    case 'app':
                        // Apps typically can't be deleted, just killed
                        await http.post(`/apps/${item.id}/kill`, { token });
                        break;
                }
            } catch {
                // Ignore cleanup errors
            }
        }
    },
};

// ============================================================
// Authentication Helpers
// ============================================================

export interface AdminCredentials {
    email: string;
    password: string;
}

export interface AuthToken {
    token: string;
    role: string;
}

// Default test admin credentials (should be created in test setup)
export const testAdmins = {
    superAdmin: { email: 'super@test.local', password: 'TestPassword123!' },
    manager: { email: 'manager@test.local', password: 'TestPassword123!' },
    marketing: { email: 'marketing@test.local', password: 'TestPassword123!' },
    analyst: { email: 'analyst@test.local', password: 'TestPassword123!' },
};

export async function login(credentials: AdminCredentials): Promise<AuthToken | null> {
    const res = await http.post<{ success: boolean; data: { token: string; user: { role: string } } }>(
        '/admin/login',
        { body: credentials }
    );

    if (res.ok && res.data?.success) {
        return {
            token: res.data.data.token,
            role: res.data.data.user.role,
        };
    }
    return null;
}

// ============================================================
// Rate Limiting Helpers
// ============================================================

export const MAX_PUSHES_PER_SECOND = 100;

export async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute requests in batches respecting rate limits
 */
export async function batchedRequests<T>(
    requests: (() => Promise<T>)[],
    batchSize: number = 50,
    delayBetweenBatches: number = 100
): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(fn => fn()));
        results.push(...batchResults);

        if (i + batchSize < requests.length) {
            await delay(delayBetweenBatches);
        }
    }

    return results;
}

// ============================================================
// Test Assertions Helpers
// ============================================================

export function expectSuccess<T>(res: ApiResponse<T>): asserts res is ApiResponse<T> & { ok: true } {
    if (!res.ok) {
        throw new Error(`Expected success but got status ${res.status}: ${JSON.stringify(res.data)}`);
    }
}

export function expectError(res: ApiResponse, expectedStatus?: number): void {
    if (res.ok) {
        throw new Error(`Expected error but got success: ${JSON.stringify(res.data)}`);
    }
    if (expectedStatus && res.status !== expectedStatus) {
        throw new Error(`Expected status ${expectedStatus} but got ${res.status}`);
    }
}
