export interface PushMessage {
    token: string;
    title: string;
    subtitle?: string;
    body: string;
    data?: Record<string, string>;
    image?: string;
    icon?: string;
    androidIcon?: string;
    actionUrl?: string;
    imageUrl?: string;
    badge?: number;
    sound?: string;
    collapseKey?: string;
    ttl?: number;
    actions?: any[];
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
    web?: {
        vapidPublicKey: string;
        vapidPrivateKey: string;
        subject: string;
    };
}

export type ProviderType = 'fcm' | 'hms' | 'apns' | 'web';

/**
 * Credential types for each provider
 */
export interface FCMCredentials {
    projectId: string;
    clientEmail: string;
    privateKey: string;
}

export interface APNSCredentials {
    keyId: string;
    teamId: string;
    bundleId: string;
    privateKey: string;
    production: boolean;
}

export interface HMSCredentials {
    appId: string;
    appSecret: string;
}

export interface WebPushCredentials {
    vapidPublicKey: string;
    vapidPrivateKey: string;
    subject: string;
}

export type ProviderCredentials = FCMCredentials | APNSCredentials | HMSCredentials | WebPushCredentials;
