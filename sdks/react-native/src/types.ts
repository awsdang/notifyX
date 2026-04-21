export interface NotifyXOptions {
    appId: string;
    baseUrl: string;
    apiKey: string;
    debug?: boolean;
}

export interface UserRegistrationData {
    externalUserId: string;
    nickname?: string;
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
