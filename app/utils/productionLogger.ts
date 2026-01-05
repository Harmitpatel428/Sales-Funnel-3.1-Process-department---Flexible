'use client';

/**
 * Production-safe logging utility (SV-007)
 * 
 * Provides logging functions that automatically redact sensitive data
 * like passwords, mobile numbers, and personal identifiable information (PII).
 * 
 * Usage:
 *   import { productionLogger } from './productionLogger';
 *   productionLogger.info('Processing lead', { lead });
 */

// Sensitive field patterns to redact
const SENSITIVE_FIELDS = [
    'password',
    'passphrase',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'mobileNumber',
    'mobileNumbers',
    'number', // in mobile context
    'phone',
    'email',
    'gstNumber',
    'consumerNumber',
    'encryptedData',
    'masterKey'
];

// Regex patterns for sensitive data
const SENSITIVE_PATTERNS = [
    { pattern: /\b\d{10}\b/g, replacement: '[PHONE_REDACTED]' }, // 10-digit phone numbers
    { pattern: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z]\d?\b/gi, replacement: '[GST_REDACTED]' }, // GST numbers
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' } // Emails
];

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
    if (typeof window !== 'undefined') {
        return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }
    return process.env.NODE_ENV === 'development';
}

/**
 * Redact sensitive fields from an object (deep clone and modify)
 */
function redactSensitiveData(data: any, depth = 0): any {
    // Prevent infinite recursion
    if (depth > 10) return '[MAX_DEPTH]';

    if (data === null || data === undefined) {
        return data;
    }

    if (typeof data === 'string') {
        let redacted = data;
        for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
            redacted = redacted.replace(pattern, replacement);
        }
        return redacted;
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => redactSensitiveData(item, depth + 1));
    }

    if (typeof data === 'object') {
        const redacted: Record<string, any> = {};

        for (const [key, value] of Object.entries(data)) {
            const lowerKey = key.toLowerCase();

            // Check if field name is sensitive
            const isSensitive = SENSITIVE_FIELDS.some(field =>
                lowerKey.includes(field.toLowerCase())
            );

            if (isSensitive) {
                redacted[key] = '[REDACTED]';
            } else {
                redacted[key] = redactSensitiveData(value, depth + 1);
            }
        }

        return redacted;
    }

    return data;
}

/**
 * Format log arguments for safe output
 */
function formatArgs(args: any[]): any[] {
    // In development, allow full logging
    if (isDevelopment()) {
        return args;
    }

    // In production, redact sensitive data
    return args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                return redactSensitiveData(arg);
            } catch {
                return '[REDACTION_ERROR]';
            }
        }
        if (typeof arg === 'string') {
            // Redact patterns in string messages
            let redacted = arg;
            for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
                redacted = redacted.replace(pattern, replacement);
            }
            return redacted;
        }
        return arg;
    });
}

/**
 * Production-safe logger object
 * 
 * In development: Full logging with all data
 * In production: Automatic PII redaction
 */
export const productionLogger = {
    /**
     * Log informational message (safe for production)
     */
    info: (...args: any[]) => {
        console.log('[INFO]', ...formatArgs(args));
    },

    /**
     * Log warning message (safe for production)
     */
    warn: (...args: any[]) => {
        console.warn('[WARN]', ...formatArgs(args));
    },

    /**
     * Log error message (safe for production)
     */
    error: (...args: any[]) => {
        console.error('[ERROR]', ...formatArgs(args));
    },

    /**
     * Log debug message (only in development)
     */
    debug: (...args: any[]) => {
        if (isDevelopment()) {
            console.debug('[DEBUG]', ...formatArgs(args));
        }
    },

    /**
     * Log with explicit lead context (redacts lead PII)
     */
    logLead: (action: string, lead: any) => {
        if (isDevelopment()) {
            console.log(`[LEAD] ${action}:`, lead);
        } else {
            // In production, only log non-sensitive lead info
            const safeLead = {
                id: lead?.id,
                status: lead?.status,
                company: lead?.company ? '[COMPANY]' : undefined,
                isDone: lead?.isDone,
                isDeleted: lead?.isDeleted
            };
            console.log(`[LEAD] ${action}:`, safeLead);
        }
    },

    /**
     * Check if in development mode
     */
    isDevelopment
};

export default productionLogger;
