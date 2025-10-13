// CSRF Configuration
import { debugLogger, DebugCategory } from './debugLogger';

const CSRF_TOKEN_KEY = '_csrf_token';
const CSRF_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// CSRF Token Interface
interface CSRFToken {
  token: string;
  createdAt: number;
  expiresAt: number;
}

let csrfAutoRefreshInterval: NodeJS.Timeout | null = null;

/**
 * Generate a cryptographically secure random token
 * @returns Base64 encoded random token
 */
function generateRandomToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Generate a new CSRF token
 * @returns CSRF token string
 */
export function generateCSRFToken(): string {
  const token = generateRandomToken();
  const now = Date.now();
  
  const csrfToken: CSRFToken = {
    token,
    createdAt: now,
    expiresAt: now + CSRF_TOKEN_EXPIRY_MS
  };
  
  try {
    sessionStorage.setItem(CSRF_TOKEN_KEY, JSON.stringify(csrfToken));
    return token;
  } catch (error) {
    console.error('Failed to generate CSRF token:', error);
    throw new Error('Failed to generate security token');
  }
}

/**
 * Get current CSRF token, generating new one if expired
 * @returns CSRF token string or null if error
 */
export function getCSRFToken(): string | null {
  try {
    const tokenData = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (!tokenData) {
      // No token exists, generate new one
      return generateCSRFToken();
    }
    
    const csrfToken: CSRFToken = JSON.parse(tokenData);
    const now = Date.now();
    
    // Check if token is expired
    if (now >= csrfToken.expiresAt) {
      // Token expired, generate new one
      return generateCSRFToken();
    }
    
    return csrfToken.token;
  } catch (error) {
    debugLogger.error(DebugCategory.VALIDATION, 'CSRF token data is corrupted. Generating new token.', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Generate new token on error
    return generateCSRFToken();
  }
}

/**
 * Validate a CSRF token
 * @param token - Token to validate
 * @returns True if token is valid and not expired
 */
export function validateCSRFToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  try {
    const tokenData = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (!tokenData) {
      return false;
    }
    
    const csrfToken: CSRFToken = JSON.parse(tokenData);
    const now = Date.now();
    
    // Check if token is expired
    if (now >= csrfToken.expiresAt) {
      return false;
    }
    
    // Constant-time comparison
    return constantTimeCompare(token, csrfToken.token);
  } catch (error) {
    debugLogger.warn(DebugCategory.VALIDATION, 'Failed to parse CSRF token. Generating new token.', {
      error: error instanceof Error ? error.message : String(error)
    });
    // Generate new token on parse error
    generateCSRFToken();
    return false;
  }
}

/**
 * Refresh CSRF token
 * @returns New CSRF token
 */
export function refreshCSRFToken(): string {
  return generateCSRFToken();
}

/**
 * Clear CSRF token from storage
 */
export function clearCSRFToken(): void {
  try {
    sessionStorage.removeItem(CSRF_TOKEN_KEY);
    
    // Clear auto-refresh interval
    if (csrfAutoRefreshInterval) {
      clearInterval(csrfAutoRefreshInterval);
      csrfAutoRefreshInterval = null;
    }
  } catch (error) {
    console.error('Failed to clear CSRF token:', error);
  }
}

/**
 * Setup automatic CSRF token refresh
 * @returns Cleanup function
 */
export function setupCSRFAutoRefresh(): () => void {
  if (csrfAutoRefreshInterval) {
    clearInterval(csrfAutoRefreshInterval);
  }
  
  // Refresh token every 30 minutes
  csrfAutoRefreshInterval = setInterval(() => {
    try {
      refreshCSRFToken();
    } catch (error) {
      console.error('Failed to auto-refresh CSRF token:', error);
    }
  }, 30 * 60 * 1000);
  
  return () => {
    if (csrfAutoRefreshInterval) {
      clearInterval(csrfAutoRefreshInterval);
      csrfAutoRefreshInterval = null;
    }
  };
}

/**
 * Higher-order function that wraps sensitive operations with CSRF protection
 * @param operation - Function to execute
 * @param token - CSRF token to validate
 * @returns Promise with operation result
 */
export async function withCSRFProtection<T>(
  operation: () => Promise<T>,
  token: string
): Promise<T> {
  if (!validateCSRFToken(token)) {
    throw new Error('Invalid CSRF token');
  }
  
  return await operation();
}

/**
 * Require valid CSRF token or throw error
 * @param token - CSRF token to validate
 * @throws Error if token is invalid
 */
export function requireCSRFToken(token: string): void {
  if (!validateCSRFToken(token)) {
    throw new Error('Invalid CSRF token');
  }
}

/**
 * Get CSRF token statistics for debugging
 */
export function getCSRFStats(): {
  hasToken: boolean;
  token: string | null;
  createdAt: number | null;
  expiresAt: number | null;
  isExpired: boolean;
  timeUntilExpiry: number;
} {
  try {
    const tokenData = sessionStorage.getItem(CSRF_TOKEN_KEY);
    if (!tokenData) {
      return {
        hasToken: false,
        token: null,
        createdAt: null,
        expiresAt: null,
        isExpired: true,
        timeUntilExpiry: 0
      };
    }  
    
    const csrfToken: CSRFToken = JSON.parse(tokenData);
    const now = Date.now();
    const isExpired = now >= csrfToken.expiresAt;
    const timeUntilExpiry = Math.max(0, csrfToken.expiresAt - now);
    
    return {
      hasToken: true,
      token: csrfToken.token.substring(0, 8) + '...', // Only show first 8 chars for security
      createdAt: csrfToken.createdAt,
      expiresAt: csrfToken.expiresAt,
      isExpired,
      timeUntilExpiry
    };
  } catch (error) {
    debugLogger.error(DebugCategory.VALIDATION, 'Failed to get CSRF token status:', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      hasToken: false,
      token: null,
      createdAt: null,
      expiresAt: null,
      isExpired: true,
      timeUntilExpiry: 0
    };
  }
}