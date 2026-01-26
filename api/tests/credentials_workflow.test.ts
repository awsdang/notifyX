import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { prisma } from '../src/services/database';
import { createCredentialVersion, getCredentials, testCredential, activateCredential } from '../src/controllers/credentials';
import type { Request, Response } from 'express';

// Mock objects
const mockReq = (params: any = {}, body: any = {}, adminUser: any = {}) => ({
    params,
    body,
    adminUser
} as unknown as Request);

const mockRes = () => {
    const res: any = {};
    res.status = (code: number) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data: any) => {
        res.body = data;
        return res;
    };
    return res as Response & { statusCode: number; body: any };
};

describe('Credential Versioning', () => {
    let appId: string;
    let appEnvId: string;
    const env = 'UAT';

    let adminUserId: string;

    beforeAll(async () => {
        // Create Admin User
        const admin = await prisma.adminUser.create({
            data: {
                email: 'admin-test-creds@example.com',
                passwordHash: 'hash',
                name: 'Admin Test'
            }
        });
        adminUserId = admin.id;

        // Setup App and Environment
        const app = await prisma.app.create({
            data: {
                name: 'Test App',
                platforms: {},
                defaultLanguage: 'en'
            }
        });
        appId = app.id;

        // UAT env created by logic or manually here?
        const appEnv = await prisma.appEnvironment.create({
            data: {
                appId: app.id,
                env: 'UAT'
            }
        });
        appEnvId = appEnv.id;
    });

    afterAll(async () => {
        if (appId) await prisma.app.deleteMany({ where: { id: appId } });
        if (adminUserId) await prisma.adminUser.deleteMany({ where: { id: adminUserId } });
    });

    it('should create a new credential version', async () => {
        const req = mockReq({ appId, env, provider: 'fcm' }, { apiKey: 'secret' }, { id: adminUserId });
        const res = mockRes();

        await createCredentialVersion(req, res, () => { });

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.version).toBe(1);

        // Verify DB
        const version = await prisma.credentialVersion.findFirst({
            where: { id: res.body.data.id }
        });
        expect(version).toBeDefined();
        expect(version?.isActive).toBe(false);
    });

    it('should increment version on subsequent create', async () => {
        const req = mockReq({ appId, env, provider: 'fcm' }, { apiKey: 'secret-v2' }, { id: adminUserId });
        const res = mockRes();

        await createCredentialVersion(req, res, () => { });

        expect(res.body.data.version).toBe(2);
    });

    it('should list credentials with versions', async () => {
        const req = mockReq({ appId, env });
        const res = mockRes();

        await getCredentials(req, res, () => { });

        expect(res.body.success).toBe(true);
        const fcm = res.body.data.find((c: any) => c.provider === 'fcm');
        expect(fcm).toBeDefined();
        expect(fcm.versions.length).toBe(2);
        expect(fcm.activeVersion).toBeNull();
    });

    it('should activate a credential version', async () => {
        // Get version 2 ID
        const creds = await prisma.credential.findFirst({
            where: { appEnvironment: { appId, env: 'UAT' }, provider: 'fcm' },
            include: { versions: true }
        });
        const v2 = creds?.versions.find(v => v.version === 2);

        const req = mockReq({ credentialVersionId: v2?.id }, {}, { id: adminUserId });
        const res = mockRes();

        await activateCredential(req, res, () => { });

        expect(res.body.success).toBe(true);
        expect(res.body.data.activatedVersion).toBe(2);

        // Verify IsActive
        const updatedV2 = await prisma.credentialVersion.findUnique({ where: { id: v2?.id } });
        expect(updatedV2?.isActive).toBe(true);
    });
});
