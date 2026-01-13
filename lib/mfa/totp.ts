import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';

// ==========================================
// SERVER-SIDE ENCRYPTION (AES-256-CTR)
// ==========================================
const ENCRYPTION_ALGORITHM = 'aes-256-ctr';
// Use JWT_SECRET as the master key for MFA secrets if no specific key provided
const ENCRYPTION_SECRET = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-secret-key-change-me';

export function encryptSecret(text: string): string {
    const iv = randomBytes(16);
    // Derive a key from the secret to ensure correct length
    const key = scryptSync(ENCRYPTION_SECRET, 'salt', 32);

    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptSecret(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift() as string, 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');

    const key = scryptSync(ENCRYPTION_SECRET, 'salt', 32);

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);

    return decrypted.toString();
}

// ==========================================
// TOTP FUNCTIONS
// ==========================================

export async function generateTOTPSecret(username: string) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(username, process.env.MFA_TOTP_ISSUER || 'SalesFunnelApp', secret);

    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    return {
        secret,
        qrCodeUrl,
    };
}

export function verifyTOTP(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
}

export function generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
        // Generate a secure random hex string (e.g., 8 chars)
        const code = randomBytes(4).toString('hex').toUpperCase(); // 8 chars
        codes.push(code);
        // Alternatively, standard format XXXX-XXXX
    }
    return codes;
}
