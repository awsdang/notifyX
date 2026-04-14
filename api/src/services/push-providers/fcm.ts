/**
 * Firebase Cloud Messaging Provider
 * Handles Android and iOS push via FCM
 * Supports both global (env) and per-app credentials
 */

import type { PushProvider, PushMessage, PushResult, PushErrorCode } from './types';

interface FCMConfig {
    projectId: string;
    privateKey: string;
    clientEmail: string;
}

interface FCMTokenCache {
    token: string;
    expiresAt: number;
}

export class FCMProvider implements PushProvider {
    readonly name = 'fcm';
    private config: FCMConfig | null = null;
    private tokenCache: FCMTokenCache | null = null;

    constructor(config?: FCMConfig) {
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
        const projectId = process.env.FCM_PROJECT_ID;
        const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const clientEmail = process.env.FCM_CLIENT_EMAIL;

        if (projectId && privateKey && clientEmail) {
            this.config = { projectId, privateKey, clientEmail };
        }
    }

    isConfigured(): boolean {
        return this.config !== null;
    }

    private async getAccessToken(): Promise<string> {
        if (!this.config) throw new Error('FCM not configured');

        // Check cache
        if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
            return this.tokenCache.token;
        }

        // Generate JWT for Google OAuth2
        const now = Math.floor(Date.now() / 1000);
        const header = { alg: 'RS256', typ: 'JWT' };
        const payload = {
            iss: this.config.clientEmail,
            scope: 'https://www.googleapis.com/auth/firebase.messaging',
            aud: 'https://oauth2.googleapis.com/token',
            iat: now,
            exp: now + 3600,
        };

        const jwt = await this.signJWT(header, payload, this.config.privateKey);

        // Exchange JWT for access token
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to get FCM access token: ${response.status}`);
        }

        const data = await response.json() as { access_token: string; expires_in: number };
        
        this.tokenCache = {
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 1 min buffer
        };

        return this.tokenCache.token;
    }

    private async signJWT(header: object, payload: object, privateKey: string): Promise<string> {
        const crypto = await import('crypto');
        
        const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signatureInput = `${base64Header}.${base64Payload}`;

        const sign = crypto.createSign('RSA-SHA256');
        sign.update(signatureInput);
        const signature = sign.sign(privateKey, 'base64url');

        return `${signatureInput}.${signature}`;
    }

    private buildDataPayload(message: PushMessage): Record<string, string> | undefined {
        const normalizedData: Record<string, string> = {};

        for (const [key, value] of Object.entries(message.data || {})) {
            if (value === undefined || value === null) continue;
            normalizedData[key] = String(value);
        }

        normalizedData.title = message.title;
        normalizedData.body = message.body;

        if (message.subtitle) {
            normalizedData.subtitle = message.subtitle;
        }

        if (message.image) {
            normalizedData.image = message.image;
            normalizedData.imageUrl = message.image;
            normalizedData['attachment-url'] = message.image;
        }

        if (message.icon) {
            normalizedData.icon = message.icon;
            normalizedData.appIconUrl = message.icon;
        }

        if (message.actionUrl) {
            normalizedData.actionUrl = message.actionUrl;
        }

        const safeActions = (message.actions || [])
            .filter((action: any) => action?.action && action?.title)
            .map((action: any) => ({
                action: String(action.action),
                title: String(action.title),
                ...(action?.url ? { url: String(action.url) } : {}),
            }));

        if (safeActions.length > 0) {
            normalizedData.actions = JSON.stringify(safeActions);
        }

        for (const action of safeActions) {
            if (action.url) {
                normalizedData[`actionUrl_${action.action}`] = action.url;
            }
        }

        return Object.keys(normalizedData).length > 0 ? normalizedData : undefined;
    }

    async send(message: PushMessage): Promise<PushResult> {
        if (!this.config) {
            return {
                success: false,
                error: 'FCM not configured',
                errorCode: 'UNKNOWN',
                shouldRetry: false,
                invalidToken: false,
            };
        }

        try {
            const accessToken = await this.getAccessToken();
            const url = `https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`;
            const dataPayload = this.buildDataPayload(message);

            const fcmMessage = {
                message: {
                    token: message.token,
                    notification: {
                        title: message.title,
                        body: message.body,
                        ...(message.image && { image: message.image }),
                    },
                    ...(dataPayload ? { data: dataPayload } : {}),
                    android: {
                        priority: 'high' as const,
                        ...(message.ttl ? { ttl: `${Math.max(0, message.ttl)}s` } : {}),
                        ...(message.collapseKey ? { collapse_key: message.collapseKey } : {}),
                        notification: {
                            sound: message.sound || 'default',
                            ...(message.androidIcon && { icon: message.androidIcon }),
                            ...(message.image && { image: message.image }),
                        },
                    },
                    apns: {
                        payload: {
                            aps: {
                                alert: {
                                    title: message.title,
                                    body: message.body,
                                    ...(message.subtitle ? { subtitle: message.subtitle } : {}),
                                },
                                sound: message.sound || 'default',
                                badge: message.badge,
                                ...(message.image ? { 'mutable-content': 1 } : {}),
                            },
                        },
                        ...(message.image ? { fcm_options: { image: message.image } } : {}),
                    },
                },
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(fcmMessage),
            });

            if (response.ok) {
                const data = await response.json() as { name: string };
                return {
                    success: true,
                    messageId: data.name,
                    shouldRetry: false,
                    invalidToken: false,
                };
            }

            const errorData = await response.json() as { error?: { code?: number; message?: string; status?: string } };
            return this.handleError(response.status, errorData);

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

    private handleError(status: number, errorData: any): PushResult {
        const errorMessage = errorData?.error?.message || 'Unknown FCM error';
        const errorStatus = errorData?.error?.status || '';

        let errorCode: PushErrorCode = 'UNKNOWN';
        let shouldRetry = false;
        let invalidToken = false;

        if (errorStatus === 'NOT_FOUND' || errorStatus === 'UNREGISTERED') {
            errorCode = 'INVALID_TOKEN';
            invalidToken = true;
        } else if (errorStatus === 'INVALID_ARGUMENT') {
            errorCode = 'INVALID_PAYLOAD';
        } else if (status === 429) {
            errorCode = 'QUOTA_EXCEEDED';
            shouldRetry = true;
        } else if (status >= 500) {
            errorCode = 'SERVER_ERROR';
            shouldRetry = true;
        }

        return {
            success: false,
            error: errorMessage,
            errorCode,
            shouldRetry,
            invalidToken,
        };
    }

    async sendBatch(messages: PushMessage[]): Promise<PushResult[]> {
        // FCM v1 doesn't have native batch - send in parallel with limit
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
