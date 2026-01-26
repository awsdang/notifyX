import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'default-secret-key-must-be-32-bytes!';

export function encrypt(text: string): { iv: string, encryptedData: string } {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

export function decrypt(encrypted: any): string {
    const iv = Buffer.from(encrypted.iv, 'hex');
    const encryptedData = Buffer.from(encrypted.encryptedData, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
