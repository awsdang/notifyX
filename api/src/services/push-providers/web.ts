/**
 * Web Push Provider (VAPID)
 * Handles browser push notifications via Web Push Protocol
 */

import crypto from 'crypto';
import webpush from 'web-push';
import type { PushProvider, PushMessage, PushResult, PushErrorCode } from './types';

interface WebPushConfig {
    vapidPublicKey: string;
    vapidPrivateKey: string;
    subject: string; // mailto: or https:// URL
}

interface WebPushSubscription {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

interface WebPushErrorLike {
    statusCode?: number;
    body?: string;
    message?: string;
    headers?: Record<string, string | string[] | undefined>;
}

function normalizeVapidPrivateKey(privateKey: string): string {
    const decoded = Buffer.from(privateKey, 'base64url');
    if (decoded.length === 32) {
        return privateKey;
    }

    const keyObject = crypto.createPrivateKey({
        key: decoded,
        format: 'der',
        type: 'pkcs8',
    });
    const jwk = keyObject.export({ format: 'jwk' }) as { d?: string };

    if (!jwk.d) {
        throw new Error('Invalid VAPID private key format');
    }

    return jwk.d;
}

function resolveMessageId(headers?: Record<string, string | string[] | undefined>): string | undefined {
    if (!headers) return undefined;

    const location = headers.location || headers.Location;
    if (Array.isArray(location)) {
        return location[0];
    }

    return location;
}

export class WebPushProvider implements PushProvider {
    readonly name = 'web';
    private config: WebPushConfig | null = null;

    constructor(config?: WebPushConfig) {
        if (config) {
            this.config = config;
        } else {
            this.loadConfig();
        }
    }

    private loadConfig(): void {
        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
        const subject = process.env.VAPID_SUBJECT;

        if (vapidPublicKey && vapidPrivateKey && subject) {
            this.config = { vapidPublicKey, vapidPrivateKey, subject };
        }
    }

    isConfigured(): boolean {
        return this.config !== null;
    }

    /**
     * Update configuration dynamically (for per-app credentials)
     */
    setConfig(config: WebPushConfig): void {
        this.config = config;
    }

    async send(message: PushMessage): Promise<PushResult> {
        if (!this.config) {
            return {
                success: false,
                error: 'Web Push not configured',
                errorCode: 'UNKNOWN',
                shouldRetry: false,
                invalidToken: false,
            };
        }

        try {
            const subscription: WebPushSubscription = JSON.parse(message.token);
            if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
                return {
                    success: false,
                    error: 'Invalid push subscription format',
                    errorCode: 'INVALID_TOKEN',
                    shouldRetry: false,
                    invalidToken: true,
                };
            }

            const normalizedPrivateKey = normalizeVapidPrivateKey(this.config.vapidPrivateKey);

            const safeActions = (message.actions || [])
                .filter((action: any) => action?.action && action?.title)
                .slice(0, 2)
                .map((action: any) => ({
                    action: String(action.action),
                    title: String(action.title),
                }));

            const actionUrlData = (message.actions || []).reduce(
                (acc: Record<string, string>, action: any) => {
                    if (action?.action && action?.url) {
                        acc[`actionUrl_${String(action.action)}`] = String(action.url);
                    }
                    return acc;
                },
                {},
            );

            // Create notification payload
            const payload = JSON.stringify({
                title: message.title,
                body: message.body,
                icon: message.icon || message.imageUrl, // Small icon
                image: message.image || undefined, // Large banner image — only if explicitly provided
                badge: message.badge,
                data: {
                    ...message.data,
                    subtitle: message.subtitle,
                    ...(message.actionUrl ? { actionUrl: message.actionUrl } : {}),
                    ...actionUrlData,
                },
                tag: message.collapseKey,
                actions: safeActions,
            });

            const response = await webpush.sendNotification(subscription, payload, {
                TTL: message.ttl || 86400,
                urgency: 'high',
                contentEncoding: 'aes128gcm',
                vapidDetails: {
                    subject: this.config.subject,
                    publicKey: this.config.vapidPublicKey,
                    privateKey: normalizedPrivateKey,
                },
            });

            if (response.statusCode >= 200 && response.statusCode < 300) {
                return {
                    success: true,
                    messageId: resolveMessageId(response.headers),
                    shouldRetry: false,
                    invalidToken: false,
                };
            }

            return {
                success: false,
                error: `Web Push failed: ${response.statusCode} ${response.body || ''}`.trim(),
                errorCode: this.mapErrorCode(response.statusCode),
                shouldRetry: response.statusCode >= 500,
                invalidToken: response.statusCode === 404 || response.statusCode === 410,
            };
        } catch (error) {
            const webPushError = error as WebPushErrorLike;
            const statusCode = typeof webPushError.statusCode === 'number'
                ? webPushError.statusCode
                : undefined;
            const message = webPushError.body || webPushError.message || 'Unknown error';

            if (message.includes('JSON')) {
                return {
                    success: false,
                    error: 'Invalid push subscription format',
                    errorCode: 'INVALID_TOKEN',
                    shouldRetry: false,
                    invalidToken: true,
                };
            }

            return {
                success: false,
                error: message,
                errorCode: statusCode ? this.mapErrorCode(statusCode) : 'UNKNOWN',
                shouldRetry: statusCode ? statusCode >= 500 : true,
                invalidToken: statusCode === 404 || statusCode === 410,
            };
        }
    }

    private mapErrorCode(status: number): PushErrorCode {
        switch (status) {
            case 400: return 'INVALID_TOKEN';
            case 404:
            case 410: return 'UNREGISTERED';
            case 413: return 'PAYLOAD_TOO_LARGE';
            case 429: return 'RATE_LIMITED';
            default: return 'UNKNOWN';
        }
    }
}
