/**
 * Seed Permissions
 * Seeds the permission table with all defined permission keys
 */

import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '../src/services/authz';

const prisma = new PrismaClient();

const PERMISSION_DESCRIPTIONS: Record<string, string> = {
    'org:create': 'Create organizations',
    'org:update': 'Update organizations',
    'app:create': 'Create apps',
    'app:update': 'Update apps',
    'app:kill': 'Kill/revive apps',
    'env:manage': 'Manage app environments',
    'credential:read': 'View credential metadata',
    'credential:write': 'Create/update credentials',
    'credential:test': 'Test credentials',
    'credential:rotate': 'Rotate credentials',
    'template:create': 'Create templates',
    'template:update': 'Update templates',
    'template:delete': 'Delete templates',
    'campaign:create': 'Create campaigns',
    'campaign:update': 'Update campaigns',
    'campaign:submit_review': 'Submit campaigns for review',
    'campaign:approve': 'Approve campaigns',
    'campaign:send': 'Schedule/send campaigns',
    'campaign:cancel': 'Cancel campaigns',
    'audience:upload_csv': 'Upload CSV audiences',
    'audience:use_segment': 'Use segment targeting',
    'device:search': 'Search device registry',
    'device:deactivate': 'Deactivate single device',
    'device:bulk_deactivate_user': 'Bulk deactivate user devices',
    'audit:read': 'View audit logs',
    'audit:export': 'Export audit logs',
    'stats:read': 'View statistics',
    'stats:export': 'Export statistics',
    'webhook:configure': 'Configure webhooks',
    'webhook:rotate_secret': 'Rotate webhook secrets',
    'ops:replay': 'Replay failed deliveries',
    'abtest:create': 'Create A/B tests',
    'abtest:start': 'Start A/B tests',
    'abtest:evaluate': 'Evaluate A/B tests',
    'abtest:rollout': 'Rollout A/B test winners',
};

async function seed() {
    console.log('Seeding permissions...');

    const permissionKeys = Object.values(PERMISSIONS);

    for (const key of permissionKeys) {
        const description = PERMISSION_DESCRIPTIONS[key] || key;

        await prisma.permission.upsert({
            where: { key },
            update: { description },
            create: { key, description },
        });

        console.log(`  ✓ ${key}`);
    }

    const count = await prisma.permission.count();
    console.log(`\nSeeded ${count} permissions.`);
}

seed()
    .catch((e) => {
        console.error('Error seeding permissions:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
