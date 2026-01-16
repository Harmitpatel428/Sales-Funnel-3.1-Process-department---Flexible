/**
 * Enhanced Error Handling Utilities
 * Provides enterprise-grade error classification, fingerprinting, and recovery analysis.
 */

import { ApiError } from '../lib/apiClient';

// Extended Error Types
export type ErrorType =
    | 'NETWORK'
    | 'VALIDATION'
    | 'AUTH'
    | 'SERVER'
    | 'TIMEOUT'
    | 'CONFLICT'
    | 'RATE_LIMIT'
    | 'CIRCUIT_OPEN'
    | 'HEALTH_CHECK'
    | 'UNKNOWN';

// Error Severity Levels
export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

// Error Categories
export type ErrorCategory = 'TRANSIENT' | 'PERMANENT' | 'USER_ACTION_REQUIRED';

export interface ErrorContext {
    userId?: string;
    tenantId?: string;
    endpoint?: string;
    method?: string;
    requestId?: string;
    timestamp: number;
    userAgent?: string;
    componentStack?: string;
    requestPayload?: any;
    [key: string]: any;
}

export interface ClassifiedError {
    type: ErrorType;
    category: ErrorCategory;
    severity: ErrorSeverity;
    message: string;
    code?: string;
    isRetryable: boolean;
    fingerprint: string;
    originalError: unknown;
    context?: ErrorContext;
    details?: Record<string, any>;
}

/**
 * Generate a unique fingerprint for an error for deduplication
 */
export function generateErrorFingerprint(type: ErrorType, code: string | undefined, message: string): string {
    const safeCode = code || 'NO_CODE';
    // Simple hash replacement (in production consider a proper hash function)
    const base = `${type}:${safeCode}:${message}`;
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
        const char = base.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
}

/**
 * Classify an error for appropriate handling
 */
export function classifyError(error: unknown, context?: Partial<ErrorContext>): ClassifiedError {
    const timestamp = Date.now();
    const baseContext: ErrorContext = {
        timestamp,
        ...context
    };

    let type: ErrorType = 'UNKNOWN';
    let category: ErrorCategory = 'PERMANENT';
    let severity: ErrorSeverity = 'MEDIUM';
    let message = 'An unexpected error occurred';
    let code = 'UNKNOWN';
    let details: Record<string, any> | undefined;

    // Handle ApiError
    if (isApiError(error)) {
        code = error.code || 'UNKNOWN';
        details = error.details;
        message = error.message;

        if (code === 'NETWORK_ERROR') {
            type = 'NETWORK';
            category = 'TRANSIENT';
            severity = 'MEDIUM';
        } else if (code === 'TIMEOUT') {
            type = 'TIMEOUT';
            category = 'TRANSIENT';
            severity = 'MEDIUM';
        } else if (code === 'CIRCUIT_OPEN') {
            type = 'CIRCUIT_OPEN';
            category = 'TRANSIENT';
            severity = 'CRITICAL';
        } else if (code === '401' || code === '403' || code === 'UNAUTHORIZED') {
            type = 'AUTH';
            category = 'USER_ACTION_REQUIRED';
            severity = 'CRITICAL';
        } else if (code === '400' || code === '422' || code === 'VALIDATION_ERROR') {
            type = 'VALIDATION';
            category = 'USER_ACTION_REQUIRED';
            severity = 'HIGH';
        } else if (code === '409' || code === 'CONFLICT') {
            type = 'CONFLICT';
            category = 'USER_ACTION_REQUIRED';
            severity = 'HIGH';
        } else if (code === '429' || code === 'RATE_LIMIT') {
            type = 'RATE_LIMIT';
            category = 'TRANSIENT';
            severity = 'LOW';
        } else if (code.startsWith('5')) {
            type = 'SERVER';
            category = 'TRANSIENT';
            severity = 'HIGH';
            message = 'Server error. Please try again later.';
        }
    } else if (error instanceof Error) {
        message = error.message;

        // Basic detection logic
        if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
            type = 'NETWORK';
            category = 'TRANSIENT';
            severity = 'MEDIUM';
            message = 'Network error. Please check your connection.';
        } else if (message.includes('timeout') || message.includes('aborted')) {
            type = 'TIMEOUT';
            category = 'TRANSIENT';
            severity = 'MEDIUM';
        } else if (message.includes('Circuit breaker open')) {
            type = 'CIRCUIT_OPEN';
            category = 'TRANSIENT';
            severity = 'CRITICAL';
        }
    }

    // Determine retryability based on category
    const isRetryable = category === 'TRANSIENT';
    const fingerprint = generateErrorFingerprint(type, code, message);

    return {
        type,
        category,
        severity,
        message,
        code,
        isRetryable,
        fingerprint,
        originalError: error,
        context: baseContext,
        details
    };
}

/**
 * Type guard for ApiError
 */
export function isApiError(error: unknown): error is ApiError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'success' in error &&
        (error as any).success === false &&
        'message' in error
    );
}

/**
 * Check if error is a network/offline error
 */
export function isNetworkError(error: unknown): boolean {
    const classified = classifyError(error);
    return classified.type === 'NETWORK' || classified.type === 'TIMEOUT';
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: unknown): string {
    const classified = classifyError(error);
    return classified.message;
}
