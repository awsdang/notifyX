/**
 * Huawei Mobile Services Push Provider
 * Handles Huawei device push notifications
 * Supports both global (env) and per-app credentials
 */

import type { PushProvider, PushMessage, PushResult, PushErrorCode } from './types';

interface HMSConfig {
    appId: string;
    appSecret: string;
}

interface HMSTokenCache {
    token: string;
    expiresAt: number;
}

export class HMSProvider implements PushProvider {
    readonly name = 'hms';
    private config: HMSConfig | null = null;
    private tokenCache: HMSTokenCache | null = null;

    constructor(config?: HMSConfig) {
        if (config) {
            // Per-app credentials passed directly
            this.config = config;
        } else {
            // Load from environment (global fallback)
            this.loadConfig();
        }
    }

    private loadConfig(): void {
        const appId = process.env.HMS_APP_ID;
        const appSecret = process.env.HMS_APP_SECRET;

        if (appId && appSecret) {
            this.config = { appId, appSecret };
        }
    }

    isConfigured(): boolean {
        return this.config !== null;
    }

    private async getAccessToken(): Promise<string> {
        if (!this.config) throw new Error('HMS not configured');

        // Check cache
        if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
            return this.tokenCache.token;
        }

        const response = await fetch('https://oauth-login.cloud.huawei.com/oauth2/v3/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.config.appId,
                client_secret: this.config.appSecret,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to get HMS access token: ${response.status}`);
        }

        const data = await response.json() as { access_token: string; expires_in: number };
        
        this.tokenCache = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in - 60) * 1000,
        };

        return this.tokenCache.token;
    }

    async send(message: PushMessage): Promise<PushResult> {
        if (!this.config) {
            return {
                success: false,
                error: 'HMS not configured',
                errorCode: 'UNKNOWN',
                shouldRetry: false,
                invalidToken: false,
            };
        }

        try {
            const accessToken = await this.getAccessToken();
            const url = `https://push-api.cloud.huawei.com/v1/${this.config.appId}/messages:send`;
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

            const hmsMessage = {
                message: {
                    token: [message.token],
                    notification: {
                        title: message.title,
                        body: message.body,
                        ...(message.image && { image: message.image }),
                    },
                    data:
                        Object.keys(normalizedData).length > 0
                            ? JSON.stringify(normalizedData)
                            : undefined,
                    android: {
                        notification: {
                            sound: message.sound || 'default',
                            default_sound: !message.sound,
                            importance: 'HIGH',
                            click_action: { type: 3 },
                            ...(message.icon && { icon: message.icon }),
                        },
                    },
                },
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(hmsMessage),
            });

            const data = await response.json() as { 
                code: string; 
                msg: string; 
                requestId?: string 
            };

            if (data.code === '80000000') {
                return {
                    success: true,
                    messageId: data.requestId,
                    shouldRetry: false,
                    invalidToken: false,
                };
            }

            return this.handleError(data.code, data.msg);

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

    private handleError(code: string, message: string): PushResult {
        let errorCode: PushErrorCode = 'UNKNOWN';
        let shouldRetry = false;
        let invalidToken = false;

        // HMS error codes
        switch (code) {
            case '80100000': // Invalid token
            case '80100001': // Token expired
            case '80200001': // Token not found
                errorCode = 'INVALID_TOKEN';
                invalidToken = true;
                break;
            case '80100003': // Invalid message
                errorCode = 'INVALID_PAYLOAD';
                break;
            case '80300002': // Quota exceeded
                errorCode = 'QUOTA_EXCEEDED';
                shouldRetry = true;
                break;
            case '80300007': // Server busy
            case '80600001': // Internal error
                errorCode = 'SERVER_ERROR';
                shouldRetry = true;
                break;
        }

        return {
            success: false,
            error: message,
            errorCode,
            shouldRetry,
            invalidToken,
        };
    }

    async sendBatch(messages: PushMessage[]): Promise<PushResult[]> {
        // HMS supports up to 1000 tokens per request, but we send individually for better error handling
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
