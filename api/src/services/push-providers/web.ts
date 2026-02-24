/**
 * Web Push Provider (VAPID)
 * Handles browser push notifications via Web Push Protocol
 */

import crypto from 'crypto';
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

            // Encrypt payload using Web Push encryption
            // Note: This implementation is simplified and lacks proper ECDH/HKDF for full encryption
            // Real implementation would use 'web-push' library or full crypto implementation
            // For now, we will send data if we can, but the encryption logic below is incomplete/placeholder

            // FIXME: The encryption logic below is complex and might be error-prone implemented manually.
            // Ideally we should use the 'web-push' library, but we are implementing from scratch.
            // For this fix, I am ensuring 'require' is gone. The logic remains as is.

            // ... (rest of logic) ...
            // Actually, the user has specific crypto logic. I should preserve it but use the imported crypto.

            // Temporarily returning invalid token to avoid crashing on encryption if logic is broken?
            // No, user wants me to fix the "require" error.

            // Encrypt payload using Web Push encryption
            const encrypted = await this.encryptPayload(
                payload,
                JSON.parse(message.token).keys.p256dh,
                JSON.parse(message.token).keys.auth
            );

            // Send to push service
            // ... (The rest is fetching)
            // Wait, the send method was accessing subscription.keys.p256dh which is fine.

            // Let's rewrite the method carefully to preserve logic but use top-level crypto

            // ... Re-reading the previous file content ...
            // encryption logic calls this.encryptPayload which calls this.hkdf

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

        // Convert VAPID private key from base64url to PEM format
        const privateKeyBuffer = Buffer.from(this.config.vapidPrivateKey, 'base64url');
        const privateKey = crypto.createPrivateKey({
            key: privateKeyBuffer,
            format: 'der',
            type: 'pkcs8',
        });

        // Sign with ES256 using IEEE P1363 format (required for JWT)
        // Standard createSign produces DER signature which is invalid for JWT
        const signature = crypto.sign(
            'SHA256',
            Buffer.from(unsignedToken),
            {
                key: privateKey,
                dsaEncoding: 'ieee-p1363',
            }
        );

        const token = `${unsignedToken}.${signature.toString('base64url')}`;

        return {
            'Authorization': `vapid t=${token}, k=${this.config.vapidPublicKey}`,
        };
    }

    private async encryptPayload(
        payload: string,
        p256dh: string,
        auth: string
    ): Promise<Buffer> {
        // Decode subscription keys
        const clientPublicKey = Buffer.from(p256dh, 'base64url');
        const clientAuthSecret = Buffer.from(auth, 'base64url');

        // 1. Generate server key pair
        const serverKeys = crypto.generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
        });

        const serverPublicKey = (serverKeys.publicKey as any)
            .export({ type: 'spki', format: 'der' })
            .subarray(-65); // Get uncompressed point (1 + 32 + 32 bytes)

        // 2. Perform ECDH to get shared secret
        const sharedSecret = crypto.diffieHellman({
            privateKey: serverKeys.privateKey,
            publicKey: crypto.createPublicKey({
                key: Buffer.concat([
                    Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'),
                    clientPublicKey,
                ]),
                format: 'der',
                type: 'spki',
            })
        });

        // 3. Generate salt
        const salt = crypto.randomBytes(16);

        // 4. HKDF derivation as per RFC 8291 (aes128gcm)
        // HKDF-Extract(salt=auth_secret, ikm=shared_secret) -> PRK
        const prk = crypto.createHmac('sha256', clientAuthSecret).update(sharedSecret).digest();

        // IKM = HKDF-Expand(PRK, info, 32)
        const info = Buffer.concat([
            Buffer.from('WebPush: info\0', 'utf8'),
            clientPublicKey,
            serverPublicKey
        ]);
        const ikm = this.hkdf(prk, info, 32);

        // Content Encryption Key (CEK) & Nonce derivation
        const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0', 'utf8');
        const nonceInfo = Buffer.from('Content-Encoding: nonce\0', 'utf8');

        // PRK_CEK = HKDF-Extract(salt=salt, ikm=ikm)
        const prkCek = crypto.createHmac('sha256', salt).update(ikm).digest();

        const cek = this.hkdf(prkCek, cekInfo, 16);
        const nonce = this.hkdf(prkCek, nonceInfo, 12);

        // 5. Encrypt with AES-128-GCM
        const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);

        // Add padding (RFC 8188: data || 0x02 for last record)
        const paddedPayload = Buffer.concat([
            Buffer.from(payload),
            Buffer.from([2]),
        ]);

        const encrypted = Buffer.concat([cipher.update(paddedPayload), cipher.final()]);
        const tag = cipher.getAuthTag();

        // 6. Build aes128gcm record (Salt || RS (4096) || IDLEN || ID (PubKey) || Data)
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

    private hkdf(prk: Buffer, info: Buffer, length: number): Buffer {
        // Simple HKDF-Expand for lengths <= 32
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
