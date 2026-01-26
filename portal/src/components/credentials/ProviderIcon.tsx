import { Smartphone, Globe, Apple } from 'lucide-react';
import { clsx } from 'clsx';

export const PROVIDER_INFO = {
    fcm: {
        name: 'Firebase Cloud Messaging',
        icon: Smartphone,
        color: 'text-orange-500',
        bgColor: 'bg-orange-50',
        description: 'Android, iOS, and Web push via Firebase',
        fileExt: '.json',
        fileLabel: 'Service Account JSON',
        fields: [
            { key: 'projectId', label: 'Project ID', type: 'text', placeholder: 'my-firebase-project' },
            { key: 'clientEmail', label: 'Client Email', type: 'email', placeholder: 'firebase-adminsdk@project.iam.gserviceaccount.com' },
            { key: 'privateKey', label: 'Private Key', type: 'textarea', placeholder: '-----BEGIN PRIVATE KEY-----\n...' },
        ],
    },
    apns: {
        name: 'Apple Push Notification Service',
        icon: Apple,
        color: 'text-gray-700',
        bgColor: 'bg-gray-100',
        description: 'Native iOS push notifications',
        fileExt: '.p8',
        fileLabel: 'Auth Key (.p8)',
        fields: [
            { key: 'keyId', label: 'Key ID', type: 'text', placeholder: 'ABC123DEFG' },
            { key: 'teamId', label: 'Team ID', type: 'text', placeholder: 'TEAM123456' },
            { key: 'bundleId', label: 'Bundle ID', type: 'text', placeholder: 'com.yourapp.bundle' },
            { key: 'privateKey', label: 'Private Key Content', type: 'textarea', placeholder: '-----BEGIN PRIVATE KEY-----\n...' },
            { key: 'production', label: 'Production Environment', type: 'checkbox' },
        ],
    },
    hms: {
        name: 'Huawei Mobile Services',
        icon: Smartphone,
        color: 'text-red-500',
        bgColor: 'bg-red-50',
        description: 'Push for Huawei devices',
        fields: [
            { key: 'appId', label: 'App ID', type: 'text', placeholder: '12345678' },
            { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: '••••••••••••••••' },
        ],
    },
    web: {
        name: 'Web Push (VAPID)',
        icon: Globe,
        color: 'text-blue-500',
        bgColor: 'bg-blue-50',
        description: 'Browser push notifications',
        fields: [
            { key: 'vapidPublicKey', label: 'VAPID Public Key', type: 'text', placeholder: 'BEl62i...' },
            { key: 'vapidPrivateKey', label: 'VAPID Private Key', type: 'password', placeholder: '••••••••' },
            { key: 'subject', label: 'Subject', type: 'text', placeholder: 'mailto:admin@yourapp.com' },
        ],
    },
};

export type ProviderKey = keyof typeof PROVIDER_INFO;

export function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
    const info = PROVIDER_INFO[provider as ProviderKey];
    if (!info) return null;
    const Icon = info.icon;
    return (
        <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", info.bgColor, className)}>
            <Icon className={clsx("w-7 h-7", info.color)} />
        </div>
    );
}
