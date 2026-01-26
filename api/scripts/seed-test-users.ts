/**
 * Database Seed Script
 * Creates test admin users for running tests
 * 
 * Run: bun scripts/seed-test-users.ts
 */

import { prisma } from '../src/services/database';
import crypto from 'crypto';

// Same hash function as admin.ts
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const usedSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, usedSalt, 100000, 64, 'sha512').toString('hex');
    return { hash: `${usedSalt}:${hash}`, salt: usedSalt };
}

const testAdmins = [
    { email: 'super@test.local', name: 'Super Admin', role: 'SUPER_ADMIN' as const },
    { email: 'manager@test.local', name: 'App Manager', role: 'APP_MANAGER' as const },
    { email: 'marketing@test.local', name: 'Marketing Manager', role: 'MARKETING_MANAGER' as const },
];

async function main() {
    console.log('🌱 Seeding test admin users...');

    const password = 'TestPassword123!';

    for (const admin of testAdmins) {
        const existing = await prisma.adminUser.findUnique({
            where: { email: admin.email }
        });

        if (existing) {
            console.log(`  ⏭️  ${admin.email} already exists`);
            continue;
        }

        const { hash } = hashPassword(password);

        await prisma.adminUser.create({
            data: {
                email: admin.email,
                name: admin.name,
                role: admin.role,
                passwordHash: hash,
            }
        });

        console.log(`  ✅ Created ${admin.email} (${admin.role})`);
    }

    console.log('\n✨ Seeding complete!');
    console.log('\nTest credentials:');
    console.log(`  Email: super@test.local`);
    console.log(`  Password: ${password}`);

    await prisma.$disconnect();
}

main().catch(e => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
});
