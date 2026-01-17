/**
 * Document Encryption Module
 * Provides AES-256-GCM encryption for document content with key management
 */

import * as crypto from 'crypto';

// Constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// Types
export interface DocumentKey {
    key: string; // Base64 encoded
    iv: string;  // Base64 encoded
}

export interface EncryptedData {
    data: Buffer;
    authTag: Buffer;
}

export interface MasterKeyConfig {
    // In production, this would be AWS KMS Key ID or Azure Key Vault key name
    provider: 'local' | 'aws-kms' | 'azure-keyvault';
    keyId?: string;
    localKey?: string; // Only for development
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a new document encryption key and IV
 */
export function generateDocumentKey(): DocumentKey {
    const key = crypto.randomBytes(KEY_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    return {
        key: key.toString('base64'),
        iv: iv.toString('base64'),
    };
}

/**
 * Generate a random key for testing purposes
 */
export function generateRandomKey(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
}

// ============================================================================
// Document Encryption/Decryption
// ============================================================================

/**
 * Encrypt document content using AES-256-GCM
 */
export function encryptDocument(
    buffer: Buffer,
    keyBase64: string,
    ivBase64: string
): EncryptedData {
    const key = Buffer.from(keyBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');

    if (key.length !== KEY_LENGTH) {
        throw new Error(`Invalid key length: expected ${KEY_LENGTH}, got ${key.length}`);
    }

    if (iv.length !== IV_LENGTH) {
        throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
    }

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(buffer),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
        data: encrypted,
        authTag,
    };
}

/**
 * Encrypt document and include auth tag in the output buffer
 */
export function encryptDocumentWithTag(
    buffer: Buffer,
    keyBase64: string,
    ivBase64: string
): Buffer {
    const { data, authTag } = encryptDocument(buffer, keyBase64, ivBase64);

    // Prepend auth tag to encrypted data
    return Buffer.concat([authTag, data]);
}

/**
 * Decrypt document content using AES-256-GCM
 */
export function decryptDocument(
    encryptedBuffer: Buffer,
    authTag: Buffer,
    keyBase64: string,
    ivBase64: string
): Buffer {
    const key = Buffer.from(keyBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');

    if (key.length !== KEY_LENGTH) {
        throw new Error(`Invalid key length: expected ${KEY_LENGTH}, got ${key.length}`);
    }

    if (iv.length !== IV_LENGTH) {
        throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final(),
    ]);
}

/**
 * Decrypt document where auth tag is prepended to the data
 */
export function decryptDocumentWithTag(
    encryptedBufferWithTag: Buffer,
    keyBase64: string,
    ivBase64: string
): Buffer {
    const authTag = encryptedBufferWithTag.subarray(0, AUTH_TAG_LENGTH);
    const encryptedData = encryptedBufferWithTag.subarray(AUTH_TAG_LENGTH);

    return decryptDocument(encryptedData, authTag, keyBase64, ivBase64);
}

// ============================================================================
// Master Key Encryption (for document keys)
// ============================================================================

/**
 * Get the master key for encrypting document keys
 * In production, this would use AWS KMS or Azure Key Vault
 */
function getMasterKey(): Buffer {
    const config = getMasterKeyConfig();

    if (config.provider === 'local') {
        const keyStr = config.localKey || process.env.DOCUMENT_MASTER_KEY;
        if (!keyStr) {
            // Generate a development key if not set
            console.warn('WARNING: Using generated master key. Set DOCUMENT_MASTER_KEY in production.');
            return crypto.createHash('sha256').update('development-key').digest();
        }

        // Support both Hex (64 chars) and Base64 (44 chars for 32 bytes)
        let keyBuffer: Buffer;
        if (keyStr.length === 64 && /^[0-9a-fA-F]+$/.test(keyStr)) {
            keyBuffer = Buffer.from(keyStr, 'hex');
        } else {
            keyBuffer = Buffer.from(keyStr, 'base64');
        }

        if (keyBuffer.length !== 32) {
            throw new Error(`Invalid master key length: expected 32 bytes, got ${keyBuffer.length}. Check DOCUMENT_MASTER_KEY.`);
        }

        return keyBuffer;
    }

    throw new Error(`Master key provider '${config.provider}' not implemented. Use AWS KMS or Azure Key Vault in production.`);
}

function getMasterKeyConfig(): MasterKeyConfig {
    const provider = (process.env.MASTER_KEY_PROVIDER || 'local') as MasterKeyConfig['provider'];

    return {
        provider,
        keyId: process.env.MASTER_KEY_ID,
        localKey: process.env.DOCUMENT_MASTER_KEY,
    };
}

/**
 * Encrypt a document key using the master key
 */
export function encryptDocumentKey(documentKey: string): string {
    const masterKey = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
    const encrypted = Buffer.concat([
        cipher.update(documentKey, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedKey (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a document key using the master key
 */
export function decryptDocumentKey(encryptedDocumentKey: string): string {
    const parts = encryptedDocumentKey.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted document key format');
    }

    const [ivBase64, authTagBase64, encryptedBase64] = parts;
    const masterKey = getMasterKey();
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const encrypted = Buffer.from(encryptedBase64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]).toString('utf8');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Securely compare two strings (constant-time)
 */
export function secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
        return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash sensitive data for storage (one-way)
 */
export function hashData(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(data, actualSalt, 100000, 64, 'sha512');
    return `${actualSalt}:${hash.toString('hex')}`;
}

/**
 * Verify hashed data
 */
export function verifyHash(data: string, hashedData: string): boolean {
    const [salt, _hash] = hashedData.split(':');
    const newHash = hashData(data, salt);
    return secureCompare(newHash, hashedData);
}

// ============================================================================
// Document Encryption Service (High-level API)
// ============================================================================

export interface EncryptedDocumentBundle {
    encryptedData: Buffer;
    encryptedKey: string; // Master-key encrypted document key
    iv: string;
    checksum: string;
}

/**
 * Encrypt a document and return all necessary data for storage
 */
export function encryptDocumentForStorage(buffer: Buffer): EncryptedDocumentBundle {
    // Generate checksum of original data
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    // Generate document-specific key
    const { key, iv } = generateDocumentKey();

    // Encrypt the document
    const encryptedData = encryptDocumentWithTag(buffer, key, iv);

    // Encrypt the document key with master key
    const encryptedKey = encryptDocumentKey(key);

    return {
        encryptedData,
        encryptedKey,
        iv,
        checksum,
    };
}

/**
 * Decrypt a document from storage
 */
export function decryptDocumentFromStorage(
    encryptedData: Buffer,
    encryptedKey: string,
    iv: string
): Buffer {
    // Decrypt the document key
    const documentKey = decryptDocumentKey(encryptedKey);

    // Decrypt the document
    return decryptDocumentWithTag(encryptedData, documentKey, iv);
}
