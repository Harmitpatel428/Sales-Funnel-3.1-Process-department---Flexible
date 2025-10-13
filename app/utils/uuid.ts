/**
 * Centralized UUID generation utility with crypto.randomUUID() polyfill
 * Provides RFC4122 v4 UUID generation with fallback for older browsers
 */

/**
 * Generates a RFC4122 v4 UUID using the best available method
 * @returns A UUID string in format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
export function generateUUID(): string {
  try {
    // Try native crypto.randomUUID() first (modern browsers)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    
    // Fallback to crypto.getRandomValues() if available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return generateUUIDWithGetRandomValues();
    }
    
    // Final fallback to Math.random() with timestamp
    return generateUUIDWithMathRandom();
    
  } catch (error) {
    // If all crypto methods fail, use Math.random() fallback
    console.warn('Crypto API failed, using Math.random() fallback for UUID generation:', error);
    return generateUUIDWithMathRandom();
  }
}

/**
 * Generates UUID using crypto.getRandomValues() (RFC4122 v4 compliant)
 */
function generateUUIDWithGetRandomValues(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  
  // Set version (4) and variant bits
  array[6] = (array[6] & 0x0f) | 0x40; // Version 4
  array[8] = (array[8] & 0x3f) | 0x80; // Variant 10
  
  // Convert to hex string with proper formatting
  const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
}

/**
 * Generates UUID using Math.random() with timestamp prefix for uniqueness
 * Note: This is not RFC4122 compliant but provides sufficient uniqueness for the application
 */
function generateUUIDWithMathRandom(): string {
  const timestamp = Date.now().toString(16);
  const randomPart = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  
  // Use timestamp as prefix to ensure uniqueness
  return timestamp + '-' + randomPart.slice(timestamp.length + 1);
}

/**
 * Validates if a string is a valid UUID format
 * @param uuid - String to validate
 * @returns True if valid UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
