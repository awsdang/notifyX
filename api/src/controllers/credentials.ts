import type { Request, Response } from 'express';
import { prisma } from '../services/database';
import { AppError } from '../utils/response';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'default-secret-key-must-be-32-bytes!';

function encrypt(text: string): any {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

function decrypt(text: any): string {
    const iv = Buffer.from(text.iv, 'hex');
    const encryptedText = Buffer.from(text.encryptedData, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// 1. Create Credential Version
export const createCredentialVersion = async (req: Request, res: Response, next: any) => {
    try {
        const { appId, env, provider } = req.params as { appId: string; env: string; provider: string };
        const credentialData = req.body;
        const adminUserId = req.adminUser?.id;

        // 1. Get or Create Credential Container
        const appEnv = await prisma.appEnvironment.findUnique({
            where: { appId_env: { appId, env: env as any } }
        });

        if (!appEnv) {
            throw new AppError(404, 'App environment not found');
        }

        let credential = await prisma.credential.findFirst({
            where: { appEnvironmentId: appEnv.id, provider }
        });

        if (!credential) {
            credential = await prisma.credential.create({
                data: {
                    appEnvironmentId: appEnv.id,
                    provider
                }
            });
        }

        // 2. Determine next version
        const lastVersion = await prisma.credentialVersion.findFirst({
            where: { credentialId: credential.id },
            orderBy: { version: 'desc' }
        });
        const nextVersion = (lastVersion?.version || 0) + 1;

        // 3. Create Version
        const encrypted = encrypt(JSON.stringify(credentialData));

        const version = await prisma.credentialVersion.create({
            data: {
                credentialId: credential.id,
                version: nextVersion,
                encryptedJson: encrypted,
                isActive: false, // Must be manually activated
                createdBy: adminUserId
            }
        });

        // 4. Audit
        await prisma.auditLog.create({
            data: {
                action: 'CREDENTIAL_VERSION_CREATED',
                resource: 'credential_version',
                resourceId: version.id,
                appId,
                adminUserId,
                details: { version: nextVersion, provider, env }
            }
        });

        res.status(201).json({
            success: true,
            data: {
                id: version.id,
                version: nextVersion,
                createdAt: version.createdAt
            }
        });
    } catch (error) {
        next(error);
    }
};

// 2. Get Credentials (List Versions)
export const getCredentials = async (req: Request, res: Response, next: any) => {
    try {
        const { appId, env } = req.params as { appId: string; env: string };

        const appEnv = await prisma.appEnvironment.findUnique({
            where: { appId_env: { appId, env: env as any } },
            include: {
                credentials: {
                    include: {
                        versions: {
                            orderBy: { version: 'desc' },
                            take: 5 // Get last 5 versions
                        }
                    }
                }
            }
        });

        if (!appEnv) {
            throw new AppError(404, 'App environment not found');
        }

        const result = (appEnv as any).credentials.map((cred: any) => {
            const activeVersion = cred.versions.find((v: any) => v.isActive);
            return {
                id: cred.id,
                provider: cred.provider,
                activeVersion: activeVersion ? {
                    id: activeVersion.id,
                    version: activeVersion.version,
                    createdAt: activeVersion.createdAt,
                    createdBy: activeVersion.createdBy
                } : null,
                versions: cred.versions.map((v: any) => ({
                    id: v.id,
                    version: v.version,
                    isActive: v.isActive,
                    createdAt: v.createdAt,
                    testRunStatus: 'UNKNOWN' // Could fetch last test run status
                }))
            };
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

// 3. Test Credential Version
export const testCredential = async (req: Request, res: Response, next: any) => {
    try {
        const { credentialVersionId } = req.params as { credentialVersionId: string };
        const { testToken } = req.body;
        const adminUserId = req.adminUser?.id;

        const version = await prisma.credentialVersion.findUnique({
            where: { id: credentialVersionId },
            include: { credential: true }
        });

        if (!version) {
            throw new AppError(404, 'Credential version not found');
        }

        const decryptedCreds = JSON.parse(decrypt(version.encryptedJson));

        // TODO: Actual provider test logic here (refactor provider service to accept creds)
        // For now, simulate success/failure based on token
        let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
        let errorCode = null;
        let errorMessage = null;

        if (testToken === 'simulate_error') {
            status = 'FAILED';
            errorCode = 'INVALID_TOKEN';
            errorMessage = 'The provided token is invalid';
        }

        const testRun = await prisma.credentialTestRun.create({
            data: {
                credentialVersionId: version.id,
                status,
                errorCode,
                errorMessage,
                testedBy: adminUserId
            }
        });

        await prisma.auditLog.create({
            data: {
                action: 'CREDENTIAL_TESTED',
                resource: 'credential_test_run',
                resourceId: testRun.id,
                adminUserId,
                details: { status, versionId: version.id }
            }
        });

        res.json({
            success: true,
            data: testRun
        });
    } catch (error) {
        next(error);
    }
};

// 4. Activate Credential Version
export const activateCredential = async (req: Request, res: Response, next: any) => {
    try {
        const { credentialVersionId } = req.params as { credentialVersionId: string };
        const adminUserId = req.adminUser?.id;

        const version = await prisma.credentialVersion.findUnique({
            where: { id: credentialVersionId },
            include: { credential: true }
        });

        if (!version) {
            throw new AppError(404, 'Credential version not found');
        }

        // Deactivate others, Activate this one in transaction
        await prisma.$transaction([
            prisma.credentialVersion.updateMany({
                where: {
                    credentialId: version.credentialId,
                    isActive: true
                },
                data: {
                    isActive: false,
                    deactivatedAt: new Date()
                }
            }),
            prisma.credentialVersion.update({
                where: { id: version.id },
                data: { isActive: true }
            })
        ]);

        // Clear cache for this provider (TODO: Implement cache clearing)

        await prisma.auditLog.create({
            data: {
                action: 'CREDENTIAL_ACTIVATED',
                resource: 'credential_version',
                resourceId: version.id,
                adminUserId,
                details: { version: version.version, provider: version.credential.provider }
            }
        });

        res.json({
            success: true,
            data: {
                activatedVersion: version.version
            }
        });
    } catch (error) {
        next(error);
    }
};
