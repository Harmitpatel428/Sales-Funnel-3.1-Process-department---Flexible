/**
 * Error Handling Utilities for React Query
 */

import { ApiError } from '../lib/apiClient';

// Error types
export type ErrorType = 'NETWORK' | 'VALIDATION' | 'AUTH' | 'SERVER' | 'TIMEOUT' | 'UNKNOWN';

export interface ClassifiedError {
    type: ErrorType;
    message: string;
    code?: string;
    isRetryable: boolean;
    details?: Record<string, any>;
}

/**
 * Classify an error for appropriate handling
 */
export function classifyError(error: unknown): ClassifiedError {
    // Handle ApiError
    if (isApiError(error)) {
        const code = error.code || 'UNKNOWN';

        // Network errors
        if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
            return {
                type: code === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK',
                message: error.message,
                code,
                isRetryable: true,
                details: error.details,
            };
        }

        // Auth errors (401, 403)
        if (code === '401' || code === '403' || code === 'UNAUTHORIZED') {
            return {
                type: 'AUTH',
                message: error.message || 'Authentication required',
                code,
                isRetryable: false,
                details: error.details,
            };
        }

        // Validation errors (400, 422)
        if (code === '400' || code === '422' || code === 'VALIDATION_ERROR') {
            return {
                type: 'VALIDATION',
                message: error.message,
                code,
                isRetryable: false,
                details: error.details,
            };
        }

        // Server errors (500+)
        if (code.startsWith('5')) {
            return {
                type: 'SERVER',
                message: 'Server error. Please try again later.',
                code,
                isRetryable: true,
                details: error.details,
            };
        }

        return {
            type: 'UNKNOWN',
            message: error.message,
            code,
            isRetryable: false,
            details: error.details,
        };
    }

    // Handle standard Error
    if (error instanceof Error) {
        // Network errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
            return {
                type: 'NETWORK',
                message: 'Network error. Please check your connection.',
                isRetryable: true,
            };
        }

        return {
            type: 'UNKNOWN',
            message: error.message,
            isRetryable: false,
        };
    }

    // Unknown error type
    return {
        type: 'UNKNOWN',
        message: 'An unexpected error occurred',
        isRetryable: false,
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

    switch (classified.type) {
        case 'NETWORK':
            return 'Unable to connect. Please check your internet connection.';
        case 'TIMEOUT':
            return 'Request timed out. Please try again.';
        case 'AUTH':
            return 'Please log in to continue.';
        case 'VALIDATION':
            return classified.message || 'Please check your input and try again.';
        case 'SERVER':
            return 'Something went wrong on our end. Please try again later.';
        default:
            return classified.message || 'An error occurred. Please try again.';
    }
}

/**
 * Handle query error with appropriate user feedback
 * This can be integrated with a toast notification system
 */
export function handleQueryError(error: unknown, context?: string): void {
    const classified = classifyError(error);
    const message = context ? `${context}: ${getUserMessage(error)}` : getUserMessage(error);

    // Log error for debugging
    console.error(`[${classified.type}] ${message}`, error);

    // In a real app, this would trigger a toast notification
    // toast.error(message);
}

/**
 * Create error handler for React Query
 */
export function createQueryErrorHandler(showToast?: (message: string, type: 'error' | 'warning') => void) {
    return (error: unknown) => {
        const classified = classifyError(error);
        const message = getUserMessage(error);

        console.error(`[Query Error - ${classified.type}]`, error);

        if (showToast) {
            // Don't show toast for network errors as they're handled globally
            if (classified.type !== 'NETWORK') {
                showToast(message, 'error');
            }
        }
    };
}
