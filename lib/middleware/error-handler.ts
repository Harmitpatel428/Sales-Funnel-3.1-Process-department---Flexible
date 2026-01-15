import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { OptimisticLockError } from '@/lib/utils/optimistic-locking';

export function handleApiError(error: unknown) {
    console.error('[API Error]:', error);

    if (error instanceof ZodError) {
        return NextResponse.json(
            {
                success: false,
                message: 'Validation Error',
                errors: error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
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
