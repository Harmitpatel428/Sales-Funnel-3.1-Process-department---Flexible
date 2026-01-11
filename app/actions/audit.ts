'use server';

import { prisma } from '@/lib/db';
import crypto from 'crypto';

// ============================================================================
// AUDIT LOG SERVER ACTIONS
// ============================================================================

export interface AuditLogInput {
    actionType: string;
    entityType?: string;
    entityId?: string;
    description: string;
    performedById?: string;
    performedByName?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    beforeValue?: Record<string, unknown>;
    afterValue?: Record<string, unknown>;
    changesSummary?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Compute hash for audit log integrity (hash chaining).
 */
function computeHash(previousHash: string | null, data: string): string {
    const input = (previousHash || '') + data;
    return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Add a server-side audit log entry with hash chaining for integrity.
 */
export async function addServerAuditLog(input: AuditLogInput): Promise<void> {
    try {
        // Get the previous log entry for hash chaining
        const lastLog = await prisma.auditLog.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { hash: true },
        });

        const previousHash = lastLog?.hash || null;

        // Create data string for hashing
        const dataString = JSON.stringify({
            actionType: input.actionType,
            entityType: input.entityType,
            entityId: input.entityId,
            description: input.description,
            performedById: input.performedById,
            timestamp: new Date().toISOString(),
        });

        const hash = computeHash(previousHash, dataString);

        await prisma.auditLog.create({
            data: {
                actionType: input.actionType,
                entityType: input.entityType,
                entityId: input.entityId,
                description: input.description,
                performedById: input.performedById,
                performedByName: input.performedByName,
                ipAddress: input.ipAddress,
                userAgent: input.userAgent,
                sessionId: input.sessionId,
                beforeValue: input.beforeValue ? JSON.stringify(input.beforeValue) : undefined,
                afterValue: input.afterValue ? JSON.stringify(input.afterValue) : undefined,
                changesSummary: input.changesSummary,
                metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
                previousHash,
                hash,
            },
        });
    } catch (error) {
        console.error('Failed to add audit log:', error);
        // Don't throw - audit logging should not break the main operation
    }
}

/**
 * Get audit logs with pagination and filtering (Admin only).
 */
export async function getAuditLogs(options: {
    page?: number;
    limit?: number;
    actionType?: string;
    entityType?: string;
    entityId?: string;
    performedById?: string;
    startDate?: Date;
    endDate?: Date;
}): Promise<{
    logs: {
        id: string;
        actionType: string;
        entityType: string | null;
        entityId: string | null;
        description: string;
        performedByName: string | null;
        createdAt: Date;
        metadata: string | null;
    }[];
    total: number;
    page: number;
    totalPages: number;
}> {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (options.actionType) where.actionType = options.actionType;
    if (options.entityType) where.entityType = options.entityType;
    if (options.entityId) where.entityId = options.entityId;
    if (options.performedById) where.performedById = options.performedById;

    if (options.startDate || options.endDate) {
        where.createdAt = {};
        if (options.startDate) (where.createdAt as Record<string, unknown>).gte = options.startDate;
        if (options.endDate) (where.createdAt as Record<string, unknown>).lte = options.endDate;
    }

    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip,
            select: {
                id: true,
                actionType: true,
                entityType: true,
                entityId: true,
                description: true,
                performedByName: true,
                createdAt: true,
                metadata: true,
            },
        }),
        prisma.auditLog.count({ where }),
    ]);

    return {
        logs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * Verify audit log integrity (check hash chain).
 */
export async function verifyAuditLogIntegrity(): Promise<{
    valid: boolean;
    checkedCount: number;
    invalidEntries: string[];
}> {
    const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            actionType: true,
            entityType: true,
            entityId: true,
            description: true,
            performedById: true,
            createdAt: true,
            previousHash: true,
            hash: true,
        },
    });

    const invalidEntries: string[] = [];
    let previousHash: string | null = null;

    for (const log of logs) {
        const dataString = JSON.stringify({
            actionType: log.actionType,
            entityType: log.entityType,
            entityId: log.entityId,
            description: log.description,
            performedById: log.performedById,
            timestamp: log.createdAt.toISOString(),
        });

        const expectedHash = computeHash(log.previousHash, dataString);

        if (log.hash !== expectedHash || log.previousHash !== previousHash) {
            invalidEntries.push(log.id);
        }

        previousHash = log.hash;
    }

    return {
        valid: invalidEntries.length === 0,
        checkedCount: logs.length,
        invalidEntries,
    };
}
