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

export * from './types';

// Global singleton instances (fallback when no per-app credentials)
let globalFcm: FCMProvider | null = null;
let globalHms: HMSProvider | null = null;
let globalApns: APNSProvider | null = null;
let globalWeb: WebPushProvider | null = null;

// Cache for per-app provider instances
const appProviderCache = new Map<string, Map<ProviderType, PushProvider>>();

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
    if (appCache?.has(provider)) {
        return appCache.get(provider)!;
    }

    // Load active credentials from database (via AppEnvironment -> Credential -> CredentialVersion)
    // Defaulting to PROD for now as per current worker implementation
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
        // Fallback to global provider
        return getGlobalProvider(provider);
    }

    // Create provider with app-specific credentials
    // Note: encryptedJson should be decrypted here. Using as-is for now (assuming mock/test env or transparent encryption)
    const creds = activeVersion.encryptedJson as unknown as ProviderCredentials;
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

    // Cache the provider
    if (providerInstance) {
        if (!appProviderCache.has(appId)) {
            appProviderCache.set(appId, new Map());
        }
        appProviderCache.get(appId)!.set(provider, providerInstance);
    }

    return providerInstance;
}

/**
 * Clear cached provider for an app (call when credentials are updated)
 */
export function clearAppProviderCache(appId: string, provider?: ProviderType): void {
    if (provider) {
        appProviderCache.get(appId)?.delete(provider);
    } else {
        appProviderCache.delete(appId);
    }
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
