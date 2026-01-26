export type Priority = 'LOW' | 'NORMAL' | 'HIGH';

export interface NotificationJobData {
    notificationId: string;
    queuedAt: number;
}

export interface DeliveryJobData {
    notificationId: string;
    deviceId: string;
    appId: string;
    provider: string;
    priority: Priority;
}
