/**
 * Apple Push Notification Service Provider
 * Uses HTTP/2 API for iOS push notifications
 * Supports both global (env) and per-app credentials
 */

import type { PushProvider, PushMessage, PushResult, PushErrorCode } from './types';

interface APNSConfig {
    keyId: string;
    teamId: string;
    privateKey: string;
    bundleId: string;
    production: boolean;
}

interface APNSTokenCache {
    token: string;
    expiresAt: number;
}

export class APNSProvider implements PushProvider {
    readonly name = 'apns';
    private config: APNSConfig | null = null;
    private tokenCache: APNSTokenCache | null = null;

    constructor(config?: APNSConfig) {
        if (config) {
            // Per-app credentials passed directly
            this.config = {
                ...config,
                privateKey: config.privateKey.replace(/\\n/g, '\n'),
            };
        } else {
            // Load from environment (global fallback)
            this.loadConfig();
        }
    }

    private loadConfig(): void {
        const keyId = process.env.APNS_KEY_ID;
        const teamId = process.env.APNS_TEAM_ID;
        const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const bundleId = process.env.APNS_BUNDLE_ID;
        const production = process.env.APNS_PRODUCTION === 'true';

        if (keyId && teamId && privateKey && bundleId) {
            this.config = { keyId, teamId, privateKey, bundleId, production };
        }
    }

    isConfigured(): boolean {
        return this.config !== null;
    }

    private async getJWT(): Promise<string> {
        if (!this.config) throw new Error('APNS not configured');

        // Check cache (APNS tokens valid for 1 hour, we refresh at 50 mins)
        if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
            return this.tokenCache.token;
        }

        const crypto = await import('crypto');
        const now = Math.floor(Date.now() / 1000);

        const header = { alg: 'ES256', kid: this.config.keyId };
        const payload = { iss: this.config.teamId, iat: now };

        const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signatureInput = `${base64Header}.${base64Payload}`;

        const sign = crypto.createSign('SHA256');
        sign.update(signatureInput);
        const signature = sign.sign(this.config.privateKey, 'base64url');

        const token = `${signatureInput}.${signature}`;

        this.tokenCache = {
            token,
            expiresAt: Date.now() + 50 * 60 * 1000, // 50 minutes
        };

        return token;
    }

    private getBaseUrl(): string {
        if (!this.config) throw new Error('APNS not configured');
        return this.config.production
            ? 'https://api.push.apple.com'
            : 'https://api.sandbox.push.apple.com';
    }

    async send(message: PushMessage): Promise<PushResult> {
        if (!this.config) {
            return {
                success: false,
                error: 'APNS not configured',
                errorCode: 'UNKNOWN',
                shouldRetry: false,
                invalidToken: false,
            };
        }

        try {
            const jwt = await this.getJWT();
            const url = `${this.getBaseUrl()}/3/device/${message.token}`;
            const normalizedData: Record<string, string> = {};

            for (const [key, value] of Object.entries(message.data || {})) {
                if (value === undefined || value === null) continue;
                normalizedData[key] = String(value);
            }

            if (message.actionUrl) {
                normalizedData.actionUrl = message.actionUrl;
            }

            const safeActions = (message.actions || [])
                .filter((action: any) => action?.action && action?.title && action?.url)
                .slice(0, 2)
                .map((action: any) => ({
                    action: String(action.action),
                    title: String(action.title),
                    url: String(action.url),
                }));

            if (safeActions.length > 0) {
                normalizedData.actions = JSON.stringify(safeActions);
            }

            for (const action of safeActions) {
                normalizedData[`actionUrl_${action.action}`] = action.url;
            }

            const apnsPayload = {
                aps: {
                    alert: {
                        title: message.title,
                        body: message.body,
                    },
                    sound: message.sound || 'default',
                    badge: message.badge,
                    'mutable-content': message.image ? 1 : 0,
                    ...(safeActions.length > 0 ? { category: 'notifyx-open-links' } : {}),
                },
                ...normalizedData,
                ...(message.image && { image: message.image }),
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'apns-topic': this.config.bundleId,
                    'apns-push-type': 'alert',
                    'apns-priority': '10',
                    'apns-expiration': '0',
                },
                body: JSON.stringify(apnsPayload),
            });

            if (response.ok) {
                const apnsId = response.headers.get('apns-id');
                return {
                    success: true,
                    messageId: apnsId || undefined,
                    shouldRetry: false,
                    invalidToken: false,
                };
            }

            const errorData = await response.json() as { reason?: string };
            return this.handleError(response.status, errorData.reason);

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                errorCode: 'UNKNOWN',
                shouldRetry: true,
                invalidToken: false,
            };
        }
    }

    private handleError(status: number, reason?: string): PushResult {
        let errorCode: PushErrorCode = 'UNKNOWN';
        let shouldRetry = false;
        let invalidToken = false;

        switch (reason) {
            case 'BadDeviceToken':
            case 'Unregistered':
            case 'DeviceTokenNotForTopic':
                errorCode = 'INVALID_TOKEN';
                invalidToken = true;
                break;
            case 'ExpiredToken':
                errorCode = 'TOKEN_EXPIRED';
                invalidToken = true;
                break;
            case 'BadExpirationDate':
            case 'BadMessageId':
            case 'BadPriority':
            case 'BadTopic':
            case 'PayloadTooLarge':
            case 'InvalidPushType':
                errorCode = 'INVALID_PAYLOAD';
                break;
            case 'TooManyRequests':
                errorCode = 'QUOTA_EXCEEDED';
                shouldRetry = true;
                break;
            case 'InternalServerError':
            case 'ServiceUnavailable':
            case 'Shutdown':
                errorCode = 'SERVER_ERROR';
                shouldRetry = true;
                break;
        }

        return {
            success: false,
            error: reason || `HTTP ${status}`,
            errorCode,
            shouldRetry,
            invalidToken,
        };
    }

    async sendBatch(messages: PushMessage[]): Promise<PushResult[]> {
        // APNS requires individual requests per device
        const BATCH_SIZE = 100;
        const results: PushResult[] = [];

        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const batch = messages.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(batch.map(m => this.send(m)));
            results.push(...batchResults);
        }

        return results;
    }
}
