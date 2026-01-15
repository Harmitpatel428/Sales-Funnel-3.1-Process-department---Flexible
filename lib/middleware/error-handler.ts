import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { OptimisticLockError } from '@/lib/utils/optimistic-locking';

export function handleApiError(error: unknown) {
    console.error('[API Error]:', error);

    if (error instanceof ZodError) {
        // Import dynamically or assume it's available? 
        // Better to import at top. 
        // Since I can't add imports easily with replace_file_content mid-file without breaking, I'll return the object directly or use a helper if imported.
        // I will match formatValidationErrors logic here to avoid circular dependencies if validation.ts imports this?
        // validation.ts imports NextResponse. 
        // Let's duplicate logic or better: just map it.

        return NextResponse.json(
            {
                success: false,
                error: 'VALIDATION_ERROR',
                message: 'Validation failed',
                errors: error.issues.map(issue => {
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
                })
            },
            { status: 400 }
        );
    }

    if (error instanceof OptimisticLockError) {
        return NextResponse.json(
            {
                success: false,
                error: 'CONFLICT',
                message: error.message,
                code: 'OPTIMISTIC_LOCK_FAILED',
                details: {
                    entityType: error.entityType,
                    entityId: error.entityId,
                    expectedVersion: error.expectedVersion,
                    actualVersion: error.actualVersion
                }
            },
            { status: 409 }
        );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002: Unique constraint failed
        if (error.code === 'P2002') {
            const target = (error.meta?.target as string[])?.join(', ') || 'field';
            return NextResponse.json(
                { success: false, message: `Duplicate value for ${target}` },
                { status: 409 }
            );
        }
        // P2025: Record not found
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
