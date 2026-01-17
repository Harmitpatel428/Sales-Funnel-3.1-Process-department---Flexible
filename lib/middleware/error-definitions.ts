import { ZodError } from 'zod';
import { ClassifiedError } from '@/app/utils/errorHandling';

// Safe error classes that don't depend on Node/Prisma
export class NetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class ValidationError extends Error {
    public errors: any[];
    constructor(message: string, errors: any[] = []) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

export class AuthError extends Error {
    constructor(message: string = 'Authentication required') {
        super(message);
        this.name = 'AuthError';
    }
}

export class ConflictError extends Error {
    public details?: any;
    constructor(message: string, details?: any) {
        super(message);
        this.name = 'ConflictError';
        this.details = details;
    }
}

export class ServerError extends Error {
    constructor(message: string = 'Internal Server Error') {
        super(message);
        this.name = 'ServerError';
    }
}

export interface RecoveryAction {
    label: string;
    action: 'RETRY' | 'DISCARD' | 'SAVE_LATER' | 'CONTACT_SUPPORT' | 'LOGIN';
    isPrimary?: boolean;
}

export function classifyApiErrorCommon(error: unknown): ClassifiedError {
    let type: any = 'UNKNOWN';
    let isRetryable = false;

    if (error instanceof NetworkError) {
        type = 'NETWORK';
        isRetryable = true;
    } else if (error instanceof ValidationError || error instanceof ZodError) {
        type = 'VALIDATION';
        isRetryable = false;
    } else if (error instanceof AuthError) {
        type = 'AUTH';
        isRetryable = false;
    } else if (error instanceof ConflictError) {
        type = 'CONFLICT';
        isRetryable = false;
    } else if (error instanceof ServerError) {
        type = 'SERVER';
        isRetryable = true;
    }

    return {
        type,
        message: (error as Error).message,
        isRetryable,
        category: isRetryable ? 'TRANSIENT' : 'PERMANENT',
        severity: type === 'SERVER' ? 'HIGH' : 'MEDIUM',
        fingerprint: 'server-error',
        originalError: error
    };
}

export function getRecoveryActions(error: ClassifiedError): RecoveryAction[] {
    switch (error.type) {
        case 'NETWORK':
        case 'TIMEOUT':
        case 'SERVER':
            return [
                { label: 'Retry', action: 'RETRY', isPrimary: true },
                { label: 'Save for Later', action: 'SAVE_LATER' },
                { label: 'Contact Support', action: 'CONTACT_SUPPORT' }
            ];
        case 'AUTH':
            return [{ label: 'Log In', action: 'LOGIN', isPrimary: true }];
        case 'CONFLICT':
            return [
                { label: 'Review Changes', action: 'RETRY', isPrimary: true },
                { label: 'Discard', action: 'DISCARD' }
            ];
        case 'VALIDATION':
            return [{ label: 'Fix Errors', action: 'RETRY', isPrimary: true }];
        default:
            return [{ label: 'Retry', action: 'RETRY' }];
    }
}

export function shouldRetry(error: ClassifiedError, attemptCount: number): boolean {
    if (!error.isRetryable) return false;
    if (attemptCount >= 3) return false; // Default max retries
    return true;
}

export function getRetryDelay(attemptCount: number, error?: ClassifiedError): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, attemptCount), 30000);
    return delay;
}
