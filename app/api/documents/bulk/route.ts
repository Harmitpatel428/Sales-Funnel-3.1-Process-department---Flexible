/**
 * Document Bulk Operations API
 * POST /api/documents/bulk - Perform actions on multiple documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitDocumentUpdated, emitDocumentDeleted } from '@/lib/websocket/server';

const BulkActionSchema = z.object({
    action: z.enum(['DELETE', 'VERIFY', 'REJECT', 'DOWNLOAD_ZIP']),
    documentIds: z.array(z.string()).min(1),
    reason: z.string().optional(), // For rejection
});

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, tenantId: true, role: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check idempotency
        const idempotencyError = await idempotencyMiddleware(req, user.tenantId);
        if (idempotencyError) return idempotencyError;

        const body = await req.json();
        const { action, documentIds, reason } = BulkActionSchema.parse(body);

        // Verify ownership/tenant for all docs
        const count = await prisma.document.count({
            where: {
                id: { in: documentIds },
                tenantId: user.tenantId,
                isDeleted: false,
            },
        });

        if (count !== documentIds.length) {
            return NextResponse.json({
                error: 'One or more documents not found or access denied'
            }, { status: 403 });
        }

        let result;

        // Wrap all operations in transaction
        await prisma.$transaction(async (tx) => {
            switch (action) {
                case 'DELETE':
                    result = await tx.document.updateMany({
                        where: { id: { in: documentIds } },
                        data: {
                            isDeleted: true,
                            deletedById: user.id,
                            deletedAt: new Date(),
                            version: { increment: 1 }
                        },
                    });

                    await tx.documentAccessLog.createMany({
                        data: documentIds.map(id => ({
                            documentId: id,
                            userId: user.id,
                            action: 'BULK_DELETE',
                            ipAddress: req.headers.get('x-forwarded-for'),
                            userAgent: req.headers.get('user-agent'),
                        })),
                    });
                    break;

                case 'VERIFY':
                    result = await tx.document.updateMany({
                        where: { id: { in: documentIds } },
                        data: {
                            status: 'VERIFIED',
                            verifiedById: user.id,
                            verifiedAt: new Date(),
                            rejectionReason: null,
                            version: { increment: 1 }
                        },
                    });

                    await tx.documentAccessLog.createMany({
                        data: documentIds.map(id => ({
                            documentId: id,
                            userId: user.id,
                            action: 'BULK_VERIFY',
                            ipAddress: req.headers.get('x-forwarded-for'),
                            userAgent: req.headers.get('user-agent'),
                        })),
                    });
                    break;

                case 'REJECT':
                    if (!reason) {
                        throw new Error('Reason required for rejection');
                    }
                    result = await tx.document.updateMany({
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
                            userId: user.id,
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
                    emitDocumentDeleted(user.tenantId, doc.id, user.id);
                } else {
                    emitDocumentUpdated(user.tenantId, doc, user.id);
                }
            }
        } catch (wsError) {
            console.error('[WebSocket] Bulk document broadcast failed:', wsError);
        }

        const response = NextResponse.json({
            success: true,
            action,
            count: result?.count || 0,
        });

        // Store idempotency result
        await storeIdempotencyResult(req, response);

        return response;

    } catch (error) {
        console.error('Bulk action error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({
            error: 'Bulk action failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
