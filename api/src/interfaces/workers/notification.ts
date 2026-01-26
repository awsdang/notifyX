export interface NotificationPayload {
    userIds?: string[];
    adhocContent?: {
        title?: string;
        subtitle?: string;
        body?: string;
        image?: string;
        actionUrl?: string;
        data?: Record<string, string>;
    };
    variables?: Record<string, string>;
}
