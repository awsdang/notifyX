export interface NotifyXOptions {
    appId: string;
    baseUrl: string;
    apiKey: string;
    debug?: boolean;
}

export interface UserRegistrationData {
    externalUserId: string;
    language?: string;
    timezone?: string;
}

export interface DeviceRegistrationData {
    userId: string;
    platform: 'android' | 'ios' | 'web' | 'huawei';
    provider: 'fcm' | 'apns' | 'hms' | 'web';
    pushToken: string;
}

export interface NotifyXUser {
    id: string;
    externalUserId: string;
    appId: string;
    language: string;
    timezone: string;
    createdAt: string;
    updatedAt: string;
}

export interface NotifyXDevice {
    id: string;
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
