/**
 * Apple Push Notification Service Provider
 * Uses HTTP/2 API for iOS push notifications
 * Supports both global (env) and per-app credentials
 */

import type { PushProvider, PushMessage, PushResult, PushErrorCode } from './types';
import { connect, constants, type ClientHttp2Session } from 'node:http2';

// Store-and-forward window. A value of 0 in `apns-expiration` tells APNs to
// discard the notification if the device is offline at that instant — the
// classic cause of "the push never arrived". We default to a multi-day window
// so APNs holds and retries until the device reconnects.
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const APNS_MAX_TTL_SECONDS = 2419200; // ~28 days — APNs storage ceiling
// Close an idle HTTP/2 session after this long; APNs also closes idle sockets.
const SESSION_IDLE_MS = 5 * 60 * 1000;

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
    private session: ClientHttp2Session | null = null;

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

    /**
     * Returns a live, shared HTTP/2 session to APNs, creating one if needed.
     * Apple requires keeping connections open and multiplexing many requests
     * over them; opening and closing a connection per notification is treated
     * as a denial-of-service pattern and severely limits throughput. The
     * session is recreated automatically after a close/error/GOAWAY or idle
     * timeout. Listeners are attached ONCE here (never per-request) to avoid
     * leaking handlers on the long-lived session.
     */
    private getSession(): ClientHttp2Session {
        if (this.session && !this.session.closed && !this.session.destroyed) {
            return this.session;
        }

        const session = connect(this.getBaseUrl());
        const drop = () => {
            if (this.session === session) this.session = null;
        };
        session.on('error', drop);
        session.on('close', drop);
        session.on('goaway', () => {
            try {
                session.close();
            } catch {
                // ignore
            }
            drop();
        });
        // Don't let an idle keep-alive socket pin the event loop forever.
        session.setTimeout(SESSION_IDLE_MS, () => {
            try {
                session.close();
            } catch {
                // ignore
            }
            drop();
        });
        session.unref();

        this.session = session;
        return session;
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
            const path = `/3/device/${message.token}`;
            const normalizedData: Record<string, string> = {};

            for (const [key, value] of Object.entries(message.data || {})) {
                if (value === undefined || value === null) continue;
                normalizedData[key] = String(value);
            }

            if (message.actionUrl) {
                normalizedData.actionUrl = message.actionUrl;
                if (!normalizedData.url) {
                    normalizedData.url = message.actionUrl;
                }
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
                normalizedData[`url_${action.action}`] = action.url;
            }

            const hasNormalizedData = Object.keys(normalizedData).length > 0;
            const apnsPayload = {
                aps: {
                    alert: {
                        title: message.title,
                        ...(message.subtitle ? { subtitle: message.subtitle } : {}),
                        body: message.body,
                    },
                    sound: message.sound || 'default',
                    badge: message.badge,
                    'mutable-content': message.image ? 1 : 0,
                    ...(safeActions.length > 0 ? { category: 'notifyx-open-links' } : {}),
                },
                ...normalizedData,
                ...(hasNormalizedData ? { data: normalizedData } : {}),
                ...(message.image && { image: message.image }),
            };
            const payload = JSON.stringify(apnsPayload);

            // Compute a store-and-forward expiration. Never send 0 (= discard if
            // offline). Respect an explicit ttl, clamped to the APNs ceiling.
            const ttlSeconds = Math.min(
                APNS_MAX_TTL_SECONDS,
                message.ttl && message.ttl > 0 ? message.ttl : DEFAULT_TTL_SECONDS,
            );
            const apnsExpiration = Math.floor(Date.now() / 1000) + ttlSeconds;

            return await new Promise<PushResult>((resolve) => {
                let client: ClientHttp2Session;
                try {
                    client = this.getSession();
                } catch (error) {
                    resolve({
                        success: false,
                        error: error instanceof Error ? error.message : 'APNS HTTP/2 connection error',
                        errorCode: 'UNKNOWN',
                        shouldRetry: true,
                        invalidToken: false,
                    });
                    return;
                }

                let resolved = false;
                const done = (result: PushResult) => {
                    if (resolved) return;
                    resolved = true;
                    // Close only the per-notification stream — keep the shared
                    // HTTP/2 session open for subsequent notifications.
                    resolve(result);
                };

                const req = client.request({
                    [constants.HTTP2_HEADER_METHOD]: 'POST',
                    [constants.HTTP2_HEADER_PATH]: path,
                    authorization: `bearer ${jwt}`,
                    'apns-topic': this.config!.bundleId,
                    'apns-push-type': 'alert',
                    'apns-priority': '10',
                    'apns-expiration': String(apnsExpiration),
                    ...(message.collapseKey
                        ? { 'apns-collapse-id': String(message.collapseKey).slice(0, 64) }
                        : {}),
                    'content-type': 'application/json',
                });

                let status = 0;
                let apnsId: string | undefined;
                let rawBody = '';

                req.setEncoding('utf8');

                req.on('response', (headers) => {
                    const statusHeader = headers[constants.HTTP2_HEADER_STATUS];
                    status = typeof statusHeader === 'number' ? statusHeader : Number(statusHeader || 0);
                    const idHeader = headers['apns-id'];
                    apnsId = Array.isArray(idHeader) ? idHeader[0] : idHeader;
                });

                req.on('data', (chunk) => {
                    rawBody += chunk;
                });

                req.on('end', () => {
                    if (status >= 200 && status < 300) {
                        done({
                            success: true,
                            messageId: apnsId,
                            shouldRetry: false,
                            invalidToken: false,
                        });
                        return;
                    }

                    let reason: string | undefined;
                    if (rawBody) {
                        try {
                            const parsed = JSON.parse(rawBody) as { reason?: string };
                            reason = parsed.reason;
                        } catch {
                            reason = rawBody;
                        }
                    }

                    done(this.handleError(status || 502, reason));
                });

                req.on('error', (error) => {
                    // A stream/connection error may mean the shared session is
                    // unhealthy — drop it so the next send reconnects cleanly.
                    if (this.session === client) this.session = null;
                    try {
                        client.close();
                    } catch {
                        // ignore
                    }
                    done({
                        success: false,
                        error: error instanceof Error ? error.message : 'APNS request error',
                        errorCode: 'UNKNOWN',
                        shouldRetry: true,
                        invalidToken: false,
                    });
                });

                req.end(payload);
            });

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
