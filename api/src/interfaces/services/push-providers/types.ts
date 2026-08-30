export interface PushMessage {
    token: string;
    /**
     * Deliver as a silent data-only message: no alert, no sound, no badge.
     * Used by the re-subscribe ping so a live-but-stale device can refresh its
     * registration without the user seeing anything.
     */
    silent?: boolean;
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
    /**
     * Android notification channel id (Android 8.0+). Required for the
     * notification to display; if omitted, FCM falls back to the app's
     * `default_notification_channel_id` from the manifest. See FCM docs.
     */
    androidChannelId?: string;
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
    /**
     * Ask the provider whether a token is still deliverable, WITHOUT delivering
     * anything to the device.
     *
     * Only implemented where the provider offers a true dry run (FCM's
     * `validate_only`). Providers without one leave this undefined rather than
     * faking it with a real send — waking every device in the database to find
     * out which ones are dead is not an acceptable trade.
     *
     * `invalidToken: true` in the result means the token is confirmed dead.
     */
    validateToken?(token: string): Promise<PushResult>;
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
