export interface NotifyXOptions {
    appId: string;
    baseUrl: string;
    apiKey: string;
    debug?: boolean;
}

export interface UserRegistrationData {
    externalUserId: string;
    nickname?: string;
    phone?: string;
    language?: string;
    timezone?: string;
}

export interface DeviceRegistrationData {
    userId: string;
    platform: 'android' | 'ios' | 'web' | 'huawei';
    provider: 'fcm' | 'apns' | 'hms' | 'web';
    pushToken: string;
    /** Client-managed device identifier used to keep the same device record across subscriptions. */
    externalDeviceId?: string;
    /** Existing device ID to update (e.g. on token refresh) to prevent duplicates. */
    deviceId?: string;
}

export interface NotifyXUser {
    id: string;
    externalUserId: string;
    nickname?: string | null;
    phone?: string | null;
    appId: string;
    language: string;
    timezone: string;
    createdAt: string;
    updatedAt: string;
}

export interface NotifyXDevice {
    id: string;
    externalDeviceId?: string | null;
    userId: string;
    platform: string;
    pushToken: string;
    provider: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface NotificationActionPayload {
    data?: Record<string, unknown> | null;
    actionId?: string | null;
}

export interface NotifyXHistoryQuery {
    /** Page number (1-based). Defaults to 1. */
    page?: number;
    /** Items per page (max 100). Defaults to 20. */
    limit?: number;
    /** Filter by notification type, e.g. "transactional" | "campaign". */
    type?: string;
    /** Filter by provider, e.g. "fcm" | "apns" | "hms" | "web". */
    provider?: string;
    /** Filter by delivery status, e.g. "SENT" | "FAILED". */
    deliveryStatus?: string;
    /** ISO date string lower bound. */
    from?: string;
    /** ISO date string upper bound. */
    to?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}

export interface NotifyXHistoryItem {
    deliveryId: string;
    id: string;
    appId: string;
    userId: string;
    externalUserId: string;
    deviceId: string;
    platform: string;
    provider: string;
    type: string;
    notificationStatus: string;
    deliveryStatus: string;
    title: string;
    body: string;
    image: string | null;
    cta: Record<string, unknown> | null;
    sentAt: string | null;
    sendAt: string | null;
    createdAt: string;
    notificationCreatedAt: string;
}

export interface NotifyXHistoryResult {
    items: NotifyXHistoryItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
