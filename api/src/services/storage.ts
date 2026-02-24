import { Client } from 'minio';

const config = {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'notifyx-assets',
};

export const minioClient = new Client(config);

export async function ensureBucket() {
    try {
        const exists = await minioClient.bucketExists(config.bucket);
        if (!exists) {
            await minioClient.makeBucket(config.bucket, 'us-east-1'); // Region is required but often ignored for local

            // make public read (optional, depends on requirement, usually assets are public)
            const policy = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: ['s3:GetObject'],
                        Effect: 'Allow',
                        Principal: { AWS: ['*'] },
                        Resource: [`arn:aws:s3:::${config.bucket}/*`],
                    },
                ],
            };
            await minioClient.setBucketPolicy(config.bucket, JSON.stringify(policy));
        }
    } catch (error) {
        console.error('Failed to ensure MinIO bucket:', error);
    }
}

// Initialize bucket on startup
ensureBucket();

export async function uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimetype: string
): Promise<string> {
    const objectName = `${Date.now()}-${fileName}`;

    await minioClient.putObject(config.bucket, objectName, fileBuffer, fileBuffer.length, {
        'Content-Type': mimetype,
    });

    // Return public URL (override host for real devices if provided)
    const publicBase = process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (publicBase) {
        return `${publicBase}/${config.bucket}/${objectName}`;
    }

    const protocol = config.useSSL ? 'https' : 'http';
    return `${protocol}://${config.endPoint}:${config.port}/${config.bucket}/${objectName}`;
}

export async function getFileStream(objectName: string): Promise<NodeJS.ReadableStream> {
    return await minioClient.getObject(config.bucket, objectName);
}
