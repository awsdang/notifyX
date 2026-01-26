/**
 * Push Provider Types
 * Following Interface Segregation Principle (SOLID)
 */

export interface PushMessage {
    token: string;
    title: string;
    subtitle?: string;
    body: string;
    data?: Record<string, string>;
    image?: string;
    actionUrl?: string;
    imageUrl?: string;
    badge?: number;
    sound?: string;
    collapseKey?: string;
    ttl?: number;
}

export interface PushResult {
    success: boolean;
    messageId?: string;
    error?: string;
    errorCode?: PushErrorCode;
    shouldRetry: boolean;
    invalidToken: boolean;
}

export type PushErrorCode =
    | 'INVALID_TOKEN'
    | 'TOKEN_EXPIRED'
    | 'QUOTA_EXCEEDED'
    | 'INVALID_PAYLOAD'
    | 'SERVER_ERROR'
    | 'UNREGISTERED'
    | 'PAYLOAD_TOO_LARGE'
    | 'RATE_LIMITED'
    | 'UNKNOWN';

export interface PushProvider {
    readonly name: string;
    send(message: PushMessage): Promise<PushResult>;
    sendBatch?(messages: PushMessage[]): Promise<PushResult[]>;
    isConfigured(): boolean;
}

export interface ProviderConfig {
    fcm?: {
        projectId: string;
        privateKey: string;
        clientEmail: string;
    };
    hms?: {
        appId: string;
        appSecret: string;
    };
    apns?: {
        keyId: string;
        teamId: string;
        privateKey: string;
        bundleId: string;
        production: boolean;
    };
}
