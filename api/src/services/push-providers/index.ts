/**
 * Push Provider Factory
 * Supports both global (env-based) and per-app credentials
 */

import type { PushProvider, PushMessage, PushResult } from './types';
import { FCMProvider } from './fcm';
import { HMSProvider } from './hms';
import { APNSProvider } from './apns';
import { WebPushProvider } from './web';
import { prisma } from '../database';
import { decrypt } from '../../utils/crypto';
import { getRedisClient, getSubscriberClient } from '../redis';

export * from './types';

// Global singleton instances (fallback when no per-app credentials)
let globalFcm: FCMProvider | null = null;
let globalHms: HMSProvider | null = null;
let globalApns: APNSProvider | null = null;
let globalWeb: WebPushProvider | null = null;

// Cache for per-app provider instances with TTL support
interface CacheEntry {
    provider: PushProvider;
    expiresAt: number;
}
const appProviderCache = new Map<string, Map<ProviderType, CacheEntry>>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL fallback

// Redis Pub/Sub channel for cache invalidation across processes
const INVALIDATION_CHANNEL = 'cache:invalidate:credentials';

/**
 * Initialize Cache Sync (Subscriber)
 */
export function initCacheSync() {
    const subscriber = getSubscriberClient();
    subscriber.subscribe(INVALIDATION_CHANNEL, (err) => {
        if (err) console.error('[PushProvider] Failed to subscribe to invalidation channel:', err.message);
    });

    subscriber.on('message', (channel, message) => {
        if (channel === INVALIDATION_CHANNEL) {
            try {
                const { appId, provider } = JSON.parse(message);
                console.log(`[PushProvider] Remote cache invalidation for ${appId} (provider: ${provider || 'all'})`);

                if (provider) {
                    appProviderCache.get(appId)?.delete(provider as ProviderType);
                } else {
                    appProviderCache.delete(appId);
                }
            } catch (error) {
                console.error('[PushProvider] Error processing invalidation message:', error);
            }
        }
    });
}

// Automatically init sync if subscriber is available (for worker/api processes)
initCacheSync();

export type ProviderType = 'fcm' | 'hms' | 'apns' | 'web';

/**
 * Credential types for each provider
 */
export interface FCMCredentials {
    projectId: string;
    clientEmail: string;
    privateKey: string;
}

export interface APNSCredentials {
    keyId: string;
    teamId: string;
    bundleId: string;
    privateKey: string;
    production: boolean;
}

export interface HMSCredentials {
    appId: string;
    appSecret: string;
}

export interface WebPushCredentials {
    vapidPublicKey: string;
    vapidPrivateKey: string;
    subject: string;
}

export type ProviderCredentials = FCMCredentials | APNSCredentials | HMSCredentials | WebPushCredentials;

/**
 * Get global provider instance (env-based config)
 */
export function getGlobalProvider(provider: ProviderType): PushProvider | null {
    switch (provider) {
        case 'fcm':
            if (!globalFcm) globalFcm = new FCMProvider();
            return globalFcm.isConfigured() ? globalFcm : null;
        case 'hms':
            if (!globalHms) globalHms = new HMSProvider();
            return globalHms.isConfigured() ? globalHms : null;
        case 'apns':
            if (!globalApns) globalApns = new APNSProvider();
            return globalApns.isConfigured() ? globalApns : null;
        case 'web':
            if (!globalWeb) globalWeb = new WebPushProvider();
            return globalWeb.isConfigured() ? globalWeb : null;
        default:
            return null;
    }
}

/**
 * Get provider for a specific app (per-app credentials)
 */
export async function getAppProvider(appId: string, provider: ProviderType): Promise<PushProvider | null> {
    // Check cache first
    const appCache = appProviderCache.get(appId);
    const cached = appCache?.get(provider);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.provider;
    }

    // Load active credentials from database (via AppEnvironment -> Credential -> CredentialVersion)
    const appEnv = await prisma.appEnvironment.findUnique({
        where: { appId_env: { appId, env: 'PROD' } },
        include: {
            credentials: {
                where: { provider },
                include: {
                    versions: {
                        where: { isActive: true },
                        orderBy: { version: 'desc' },
                        take: 1
                    }
                }
            }
        }
    });

    const credential = appEnv?.credentials[0];
    const activeVersion = credential?.versions[0];

    if (!credential || !activeVersion) {
        return getGlobalProvider(provider);
    }

    // Decrypt credentials
    const creds = JSON.parse(decrypt(activeVersion.encryptedJson)) as ProviderCredentials;
    let providerInstance: PushProvider | null = null;

    switch (provider) {
        case 'fcm':
            providerInstance = new FCMProvider(creds as FCMCredentials);
            break;
        case 'hms':
            providerInstance = new HMSProvider(creds as HMSCredentials);
            break;
        case 'apns':
            providerInstance = new APNSProvider(creds as APNSCredentials);
            break;
        case 'web':
            providerInstance = new WebPushProvider(creds as WebPushCredentials);
            break;
    }

    // Cache the provider with TTL
    if (providerInstance) {
        if (!appProviderCache.has(appId)) {
            appProviderCache.set(appId, new Map());
        }
        appProviderCache.get(appId)!.set(provider, {
            provider: providerInstance,
            expiresAt: Date.now() + CACHE_TTL_MS
        });
    }

    return providerInstance;
}

/**
 * Clear cached provider for an app and publish invalidation
 */
export function clearAppProviderCache(appId: string, provider?: ProviderType): void {
    if (provider) {
        appProviderCache.get(appId)?.delete(provider);
    } else {
        appProviderCache.delete(appId);
    }

    // Publish to cluster
    const redis = getRedisClient();
    redis.publish(INVALIDATION_CHANNEL, JSON.stringify({ appId, provider }));
}

/**
 * Get provider instance by name (backward compatible - uses global)
 * @deprecated Use getAppProvider for per-app credentials
 */
export function getProvider(provider: ProviderType): PushProvider | null {
    return getGlobalProvider(provider);
}

/**
 * Check which global providers are configured
 */
export function getConfiguredProviders(): ProviderType[] {
    const providers: ProviderType[] = [];

    if (getGlobalProvider('fcm')) providers.push('fcm');
    if (getGlobalProvider('hms')) providers.push('hms');
    if (getGlobalProvider('apns')) providers.push('apns');
    if (getGlobalProvider('web')) providers.push('web');

    return providers;
}

/**
 * Get configured providers for a specific app
 */
export async function getAppConfiguredProviders(appId: string): Promise<ProviderType[]> {
    // Load active credentials from database (via AppEnvironment -> Credential -> CredentialVersion)
    // Defaulting to PROD
    const appEnv = await prisma.appEnvironment.findUnique({
        where: { appId_env: { appId, env: 'PROD' } },
        include: {
            credentials: {
                where: {
                    versions: { some: { isActive: true } }
                },
                select: { provider: true }
            }
        }
    });

    const credentials = appEnv?.credentials || [];

    const providers = credentials.map(c => c.provider as ProviderType);

    // Add global providers not overridden by app
    const globalProviders = getConfiguredProviders();
    for (const p of globalProviders) {
        if (!providers.includes(p)) {
            providers.push(p);
        }
    }

    return providers;
}

/**
 * Send push notification using appropriate provider (per-app aware)
 */
export async function sendPush(
    provider: ProviderType,
    message: PushMessage,
    appId?: string
): Promise<PushResult> {
    const pushProvider = appId
        ? await getAppProvider(appId, provider)
        : getGlobalProvider(provider);

    if (!pushProvider) {
        return {
            success: false,
            error: `Provider ${provider} not configured`,
            errorCode: 'UNKNOWN',
            shouldRetry: false,
            invalidToken: false,
        };
    }

    return pushProvider.send(message);
}

/**
 * Send batch push notifications
 */
export async function sendPushBatch(
    provider: ProviderType,
    messages: PushMessage[],
    appId?: string
): Promise<PushResult[]> {
    const pushProvider = appId
        ? await getAppProvider(appId, provider)
        : getGlobalProvider(provider);

    if (!pushProvider) {
        return messages.map(() => ({
            success: false,
            error: `Provider ${provider} not configured`,
            errorCode: 'UNKNOWN' as const,
            shouldRetry: false,
            invalidToken: false,
        }));
    }

    if (pushProvider.sendBatch) {
        return pushProvider.sendBatch(messages);
    }

    // Fallback to individual sends
    return Promise.all(messages.map(m => pushProvider.send(m)));
}
