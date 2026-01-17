import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { OptimisticLockError } from '@/lib/utils/optimistic-locking';
import { ClassifiedError } from '@/app/utils/errorHandling';
import {
    NetworkError,
    ValidationError,
    AuthError,
    ConflictError,
    ServerError,
    RecoveryAction,
    getRecoveryActions,
    shouldRetry,
    getRetryDelay,
    classifyApiErrorCommon
} from './error-definitions';

export {
    NetworkError,
    ValidationError,
    AuthError,
    ConflictError,
    ServerError,
    getRecoveryActions,
    shouldRetry,
    getRetryDelay
};

export type { RecoveryAction };

export function classifyApiError(error: unknown): ClassifiedError {
    // Check for Prisma/Server specific errors first if needed, otherwise delegate
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return {
            type: 'CONFLICT', // Mapping Prisma P2002 etc to conflict usually
            message: error.message,
            isRetryable: false,
            category: 'USER_ACTION_REQUIRED',
            severity: 'HIGH',
            fingerprint: `prisma-${error.code}`,
            originalError: error
        };
    }

    return classifyApiErrorCommon(error);
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
