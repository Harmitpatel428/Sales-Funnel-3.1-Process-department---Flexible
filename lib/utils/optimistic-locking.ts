import { Prisma } from '@prisma/client';

export class OptimisticLockError extends Error {
    constructor(
        public entityType: string,
        public entityId: string,
        public expectedVersion: number,
        public actualVersion: number
    ) {
        super(
            `Optimistic lock failed for ${entityType} ${entityId}. ` +
            `Expected version ${expectedVersion}, but found ${actualVersion}. ` +
            `The record was modified by another user.`
        );
        this.name = 'OptimisticLockError';
    }
}

export interface VersionedUpdate {
    currentVersion: number;
    data: any;
}

export async function updateWithOptimisticLock<T>(
    model: any,
    where: any,
    update: VersionedUpdate,
    entityType: string
): Promise<T> {
    const { currentVersion, data } = update;

    // Attempt update with version check
    const result = await model.updateMany({
        where: {
            ...where,
            version: currentVersion
        },
        data: {
            ...data,
            version: currentVersion + 1,
            updatedAt: new Date()
        }
    });

    // Check if update succeeded
    if (result.count === 0) {
        // Fetch current record to determine if it exists or version mismatch
        const current = await model.findFirst({ where });

        if (!current) {
            throw new Error(`${entityType} not found`);
        }

        throw new OptimisticLockError(
            entityType,
            where.id || where.caseId,
            currentVersion,
            current.version
        );
    }

    // Fetch and return updated record
    return await model.findFirst({ where });
}

export function handleOptimisticLockError(error: unknown) {
    if (error instanceof OptimisticLockError) {
        return {
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
        };
    }
    return null;
}
