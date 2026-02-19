/**
 * Document Bulk Operations API
 * POST /api/documents/bulk - Perform actions on multiple documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitDocumentUpdated, emitDocumentDeleted } from '@/lib/websocket/server';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';
import { successResponse, validationErrorResponse } from '@/lib/api/response-helpers';

const BulkActionSchema = z.object({
    action: z.enum(['DELETE', 'VERIFY', 'REJECT', 'DOWNLOAD_ZIP']),
    documentIds: z.array(z.string()).min(1),
    reason: z.string().optional(), // For rejection
});

const postHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check idempotency (Manual call as it's not yet in withApiHandler)
    const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
    if (idempotencyError) return idempotencyError;

    const body = await req.json();
    // Use safeParse to handle malformed body gracefully
    const result = BulkActionSchema.safeParse(body);
    if (!result.success) {
        return validationErrorResponse(result.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
            code: 'VALIDATION_ERROR'
        })));
    }

    const { action, documentIds, reason } = result.data;

    // Validate reason for REJECT
    if (action === 'REJECT' && !reason) {
        return validationErrorResponse(['Reason is required for rejection']);
    }

    // Verify ownership/tenant for all docs
    const count = await prisma.document.count({
        where: {
            id: { in: documentIds },
            tenantId: session.tenantId,
            isDeleted: false,
        },
    });

    if (count !== documentIds.length) {
        return NextResponse.json({
            error: 'One or more documents not found or access denied'
        }, { status: 403 });
    }

    let bulkResult;

    // Wrap all operations in transaction
    await prisma.$transaction(async (tx) => {
        switch (action) {
            case 'DELETE':
                bulkResult = await tx.document.updateMany({
                    where: { id: { in: documentIds } },
                    data: {
                        isDeleted: true,
                        deletedById: session.userId,
                        deletedAt: new Date(),
                        version: { increment: 1 }
                    },
                });

                await tx.documentAccessLog.createMany({
                    data: documentIds.map(id => ({
                        documentId: id,
                        userId: session.userId,
                        action: 'BULK_DELETE',
                        ipAddress: req.headers.get('x-forwarded-for'),
                        userAgent: req.headers.get('user-agent'),
                    })),
                });
                break;

            case 'VERIFY':
                bulkResult = await tx.document.updateMany({
                    where: { id: { in: documentIds } },
                    data: {
                        status: 'VERIFIED',
                        verifiedById: session.userId,
                        verifiedAt: new Date(),
                        rejectionReason: null,
                        version: { increment: 1 }
                    },
                });

                await tx.documentAccessLog.createMany({
                    data: documentIds.map(id => ({
                        documentId: id,
                        userId: session.userId,
                        action: 'BULK_VERIFY',
                        ipAddress: req.headers.get('x-forwarded-for'),
                        userAgent: req.headers.get('user-agent'),
                    })),
                });
                break;

            case 'REJECT':
                bulkResult = await tx.document.updateMany({
                    where: { id: { in: documentIds } },
                    data: {
                        status: 'REJECTED',
                        rejectionReason: reason,
                        verifiedById: null,
                        verifiedAt: null,
                        version: { increment: 1 }
                    },
                });

                await tx.documentAccessLog.createMany({
                    data: documentIds.map(id => ({
                        documentId: id,
                        userId: session.userId,
                        action: 'BULK_REJECT',
                        ipAddress: req.headers.get('x-forwarded-for'),
                        userAgent: req.headers.get('user-agent'),
                    })),
                });
                break;

            case 'DOWNLOAD_ZIP':
                throw new Error('Bulk ZIP download not yet implemented');
        }
    });

    // WebSocket Broadcast
    try {
        const affectedDocs = await prisma.document.findMany({
            where: { id: { in: documentIds } }
        });

        for (const doc of affectedDocs) {
            if (action === 'DELETE') {
                emitDocumentDeleted(session.tenantId, doc.id, session.userId);
            } else {
                emitDocumentUpdated(session.tenantId, doc, session.userId);
            }
        }
    } catch (wsError) {
        console.error('[WebSocket] Bulk document broadcast failed:', wsError);
    }

    const response = NextResponse.json({
        success: true,
        action,
        count: bulkResult?.count || 0,
    });

    // Store idempotency result
    await storeIdempotencyResult(req, response);

    return response;
};

export const POST = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 20 }, postHandler);
