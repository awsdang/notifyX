export interface NotificationPayload {
    userIds?: string[];
    platforms?: Array<"android" | "ios" | "huawei" | "web">;
    adhocContent?: {
        title?: string;
        subtitle?: string;
        body?: string;
        image?: string;
        icon?: string;
        actionUrl?: string;
        actions?: Array<{ action: string; title: string; url?: string }>;
        data?: Record<string, string>;
    };
    variables?: Record<string, string>;
}
