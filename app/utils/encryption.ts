/**
 * Encryption utility for sensitive data storage
 * 
 * Implements AES-GCM encryption with PBKDF2 key derivation for secure
 * storage of sensitive data like passwords and security answers.
 * 
 * Features:
 * - AES-GCM encryption with authenticated encryption
 * - PBKDF2 key derivation from user passphrase
 * - Unique IV per encryption operation
 * - Master key management and rotation
 * - Secure key storage and retrieval
 */

// Encryption configuration
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes for GCM
const SALT_LENGTH = 16; // bytes

// Sensitive keys that require encryption
const SENSITIVE_KEYS = [
  'leadPasswordConfig',
  'leadSecurityAnswers'
];

// Master key management
let masterKey: CryptoKey | null = null;
let masterKeyDerived = false;

/**
 * Generate a random salt for PBKDF2
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generate a random IV for AES-GCM
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Derive encryption key from passphrase using PBKDF2
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Ensure salt is properly typed as BufferSource
  const saltBuffer = new Uint8Array(salt);
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Check if a key requires encryption
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.includes(key);
}

/**
 * Set the master passphrase and derive the encryption key
 */
export async function setMasterKey(passphrase: string): Promise<boolean> {
  try {
    if (!passphrase || passphrase.length < 8) {
      throw new Error('Master passphrase must be at least 8 characters long');
    }

    // Generate salt for key derivation
    const salt = generateSalt();
    
    // Derive the encryption key
    masterKey = await deriveKey(passphrase, salt);
    masterKeyDerived = true;

    // Store the salt (needed for key derivation on subsequent uses)
    const saltBase64 = btoa(String.fromCharCode(...salt));
    localStorage.setItem('_encryption_salt', saltBase64);

    return true;
  } catch (error) {
    console.error('Failed to set master key:', error);
    masterKey = null;
    masterKeyDerived = false;
    return false;
  }
}

/**
 * Verify master passphrase and derive encryption key
 */
export async function verifyMasterKey(passphrase: string): Promise<boolean> {
  try {
    const saltBase64 = localStorage.getItem('_encryption_salt');
    if (!saltBase64) {
      return false; // No salt found, master key not set
    }

    const salt = new Uint8Array(
      atob(saltBase64).split('').map(char => char.charCodeAt(0))
    );

    masterKey = await deriveKey(passphrase, salt);
    masterKeyDerived = true;

    return true;
  } catch (error) {
    console.error('Failed to verify master key:', error);
    masterKey = null;
    masterKeyDerived = false;
    return false;
  }
}

/**
 * Check if master key is available
 */
export function hasMasterKey(): boolean {
  return masterKeyDerived && masterKey !== null;
}

/**
 * Clear the master key from memory
 */
export function clearMasterKey(): void {
  masterKey = null;
  masterKeyDerived = false;
}

/**
 * Encrypt data using AES-GCM
 */
export async function encryptData(data: string): Promise<string> {
  if (!masterKey) {
    throw new Error('Master key not available. Call setMasterKey() or verifyMasterKey() first.');
  }

  try {
    const encoder = new TextEncoder();
    const iv = generateIV();
    
    // Ensure IV is properly typed as BufferSource
    const ivBuffer = new Uint8Array(iv);
    
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer
      },
      masterKey,
      encoder.encode(data)
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(ivBuffer.length + encryptedData.byteLength);
    combined.set(ivBuffer);
    combined.set(new Uint8Array(encryptedData), ivBuffer.length);

    // Return base64 encoded result
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-GCM
 */
export async function decryptData(encryptedData: string): Promise<string> {
  if (!masterKey) {
    throw new Error('Master key not available. Call setMasterKey() or verifyMasterKey() first.');
  }

  try {
    // Decode base64
    const combined = new Uint8Array(
      atob(encryptedData).split('').map(char => char.charCodeAt(0))
    );

    // Extract IV and encrypted data
    const iv = combined.slice(0, IV_LENGTH);
    const encrypted = combined.slice(IV_LENGTH);

    // Ensure IV is properly typed as BufferSource
    const ivBuffer = new Uint8Array(iv);

    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBuffer
      },
      masterKey,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Rotate the master key by re-encrypting all sensitive data
 */
export async function rotateMasterKey(oldPassphrase: string, newPassphrase: string): Promise<boolean> {
  try {
    // Verify old key
    const oldKeyValid = await verifyMasterKey(oldPassphrase);
    if (!oldKeyValid) {
      throw new Error('Invalid old passphrase');
    }

    // Decrypt all sensitive data
    const decryptedData: Record<string, string> = {};
    for (const key of SENSITIVE_KEYS) {
      const encryptedValue = localStorage.getItem(key);
      if (encryptedValue) {
        try {
          decryptedData[key] = await decryptData(encryptedValue);
        } catch (error) {
          console.warn(`Failed to decrypt ${key}, skipping rotation for this key:`, error);
        }
      }
    }

    // Set new master key
    const newKeySet = await setMasterKey(newPassphrase);
    if (!newKeySet) {
      throw new Error('Failed to set new master key');
    }

    // Re-encrypt all data with new key
    for (const [key, value] of Object.entries(decryptedData)) {
      try {
        const reEncrypted = await encryptData(value);
        localStorage.setItem(key, reEncrypted);
      } catch (error) {
        console.error(`Failed to re-encrypt ${key}:`, error);
        throw new Error(`Key rotation failed for ${key}`);
      }
    }

    return true;
  } catch (error) {
    console.error('Master key rotation failed:', error);
    return false;
  }
}

/**
 * Check if encryption is required for first-run setup
 */
export function requiresFirstRunSetup(): boolean {
  return !localStorage.getItem('_encryption_salt');
}

/**
 * Get encryption status information
 */
export function getEncryptionStatus(): {
  hasMasterKey: boolean;
  requiresSetup: boolean;
  sensitiveKeysCount: number;
} {
  const sensitiveKeysCount = SENSITIVE_KEYS.filter(key => 
    localStorage.getItem(key) !== null
  ).length;

  return {
    hasMasterKey: hasMasterKey(),
    requiresSetup: requiresFirstRunSetup(),
    sensitiveKeysCount
  };
}
