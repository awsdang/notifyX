/**
 * Web Push Provider (VAPID)
 * Handles browser push notifications via Web Push Protocol
 */

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
            // Parse the push token as subscription info
            // Format: JSON string of WebPushSubscription
            const subscription: WebPushSubscription = JSON.parse(message.token);

            // Create VAPID headers
            const vapidHeaders = await this.createVapidHeaders(subscription.endpoint);

            // Create notification payload
            const payload = JSON.stringify({
                title: message.title,
                body: message.body,
                icon: message.imageUrl,
                badge: message.badge,
                data: message.data,
                tag: message.collapseKey,
            });

            // Encrypt payload using Web Push encryption
            const encrypted = await this.encryptPayload(
                payload,
                subscription.keys.p256dh,
                subscription.keys.auth
            );

            // Send to push service
            const response = await fetch(subscription.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Encoding': 'aes128gcm',
                    'TTL': String(message.ttl || 86400),
                    ...vapidHeaders,
                },
                body: encrypted,
            });

            if (response.ok || response.status === 201) {
                return {
                    success: true,
                    messageId: response.headers.get('location') || undefined,
                    shouldRetry: false,
                    invalidToken: false,
                };
            }

            // Handle errors
            const errorCode = this.mapErrorCode(response.status);
            const errorBody = await response.text().catch(() => '');

            return {
                success: false,
                error: `Web Push failed: ${response.status} ${errorBody}`,
                errorCode,
                shouldRetry: response.status >= 500,
                invalidToken: response.status === 404 || response.status === 410,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            
            // Check if it's a JSON parse error (invalid token format)
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
                errorCode: 'UNKNOWN',
                shouldRetry: true,
                invalidToken: false,
            };
        }
    }

    private async createVapidHeaders(audience: string): Promise<Record<string, string>> {
        if (!this.config) throw new Error('Config not set');

        const crypto = await import('crypto');
        
        // Extract origin from endpoint
        const url = new URL(audience);
        const aud = url.origin;

        // Create JWT for VAPID
        const now = Math.floor(Date.now() / 1000);
        const header = { typ: 'JWT', alg: 'ES256' };
        const payload = {
            aud,
            exp: now + 86400, // 24 hours
            sub: this.config.subject,
        };

        const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const unsignedToken = `${base64Header}.${base64Payload}`;

        // Sign with ES256
        const sign = crypto.createSign('SHA256');
        sign.update(unsignedToken);
        
        // Convert VAPID private key from base64url to PEM format
        const privateKeyBuffer = Buffer.from(this.config.vapidPrivateKey, 'base64url');
        const privateKey = crypto.createPrivateKey({
            key: privateKeyBuffer,
            format: 'der',
            type: 'pkcs8',
        });

        const signature = sign.sign(privateKey, 'base64url');
        const token = `${unsignedToken}.${signature}`;

        return {
            'Authorization': `vapid t=${token}, k=${this.config.vapidPublicKey}`,
        };
    }

    private async encryptPayload(
        payload: string,
        p256dh: string,
        auth: string
    ): Promise<Buffer> {
        const crypto = await import('crypto');

        // Decode subscription keys
        const clientPublicKey = Buffer.from(p256dh, 'base64url');
        const clientAuthSecret = Buffer.from(auth, 'base64url');

        // Generate server key pair for ECDH
        const serverKeys = crypto.generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
        });

        // Export server public key
        const serverPublicKey = (serverKeys.publicKey as any)
            .export({ type: 'spki', format: 'der' })
            .subarray(-65); // Get uncompressed point

        // Perform ECDH
        const sharedSecret = crypto.diffieHellman({
            privateKey: serverKeys.privateKey,
            publicKey: crypto.createPublicKey({
                key: Buffer.concat([
                    Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'),
                    clientPublicKey,
                ]),
                format: 'der',
                type: 'spki',
            }),
        });

        // Generate salt
        const salt = crypto.randomBytes(16);

        // Derive keys using HKDF
        const ikm = this.hkdf(clientAuthSecret, sharedSecret, 
            Buffer.concat([Buffer.from('WebPush: info\0'), clientPublicKey, serverPublicKey]), 32);
        const prk = this.hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
        const nonce = this.hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

        // Encrypt with AES-128-GCM
        const cipher = crypto.createCipheriv('aes-128-gcm', prk, nonce);
        
        // Add padding
        const paddedPayload = Buffer.concat([
            Buffer.from(payload),
            Buffer.from([2]), // Delimiter
            Buffer.alloc(0), // No additional padding for simplicity
        ]);

        const encrypted = Buffer.concat([cipher.update(paddedPayload), cipher.final()]);
        const tag = cipher.getAuthTag();

        // Build aes128gcm record
        const recordSize = Buffer.alloc(4);
        recordSize.writeUInt32BE(4096);

        return Buffer.concat([
            salt,
            recordSize,
            Buffer.from([serverPublicKey.length]),
            serverPublicKey,
            encrypted,
            tag,
        ]);
    }

    private hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
        const crypto = require('crypto');
        const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
        const result = crypto.createHmac('sha256', prk)
            .update(Buffer.concat([info, Buffer.from([1])]))
            .digest();
        return result.subarray(0, length);
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
