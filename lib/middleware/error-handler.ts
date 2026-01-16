import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { OptimisticLockError } from '@/lib/utils/optimistic-locking';
import { ClassifiedError } from '@/app/utils/errorHandling';

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

export function classifyApiError(error: unknown): ClassifiedError {
    // Shared classification logic could go here, or simple mapping
    // This seems to duplicate client-side logic but useful for server-side logging/metrics
    // For now returning a basic shape compatible with the interface
    let type: any = 'UNKNOWN'; // Cast to any to match ErrorType from utils which we might not have full access to if shared is erratic
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
    } else if (error instanceof ConflictError || error instanceof OptimisticLockError) {
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

export function handleApiError(error: unknown) {
    console.error('[API Error]:', error);

    if (error instanceof ZodError || error instanceof ValidationError) {
        const issues = (error instanceof ZodError) ? error.issues : (error as ValidationError).errors;
        const formattedErrors = (error instanceof ZodError) ? issues.map(issue => {
            let code = 'INVALID_VALUE';
            if (issue.code === 'invalid_type') code = 'INVALID_TYPE';
            if (issue.code === 'too_small') code = 'VALUE_TOO_SMALL';
            if (issue.code === 'too_big') code = 'VALUE_TOO_LARGE';
            if (issue.message.includes('required')) code = 'REQUIRED_FIELD';
            return {
                field: issue.path.join('.'),
                message: issue.message,
                code
            };
        }) : issues;

        return NextResponse.json(
            {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Validation failed',
                errors: formattedErrors
            },
            { status: 400 }
        );
    }

    if (error instanceof OptimisticLockError || error instanceof ConflictError) {
        const details = (error instanceof OptimisticLockError) ? {
            entityType: error.entityType,
            entityId: error.entityId,
            expectedVersion: error.expectedVersion,
            actualVersion: error.actualVersion
        } : (error as ConflictError).details;

        return NextResponse.json(
            {
                success: false,
                error: 'CONFLICT',
                message: error.message,
                code: 'OPTIMISTIC_LOCK_FAILED',
                details
            },
            { status: 409 }
        );
    }

    if (error instanceof AuthError) {
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 401 }
        );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
            const target = (error.meta?.target as string[])?.join(', ') || 'field';
            return NextResponse.json(
                { success: false, message: `Duplicate value for ${target}` },
                { status: 409 }
            );
        }
        if (error.code === 'P2025') {
            return NextResponse.json(
                { success: false, message: 'Record not found' },
                { status: 404 }
            );
        }
    }

    // Generic Error
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
        { success: false, message },
        { status: 500 }
    );
}
