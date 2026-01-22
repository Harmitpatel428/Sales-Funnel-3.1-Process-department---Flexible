/**
 * Document Rejection API
 * POST /api/documents/[id]/reject - Reject a document with reason
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';

const RejectSchema = z.object({
    reason: z.string().min(1, 'Rejection reason is required'),
    version: z.number().int().min(1, 'Version is required for updates'),
});

const postHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const { id } = params;

    // Parse Body
    const body = await req.json();
    const { reason, version } = RejectSchema.parse(body);

    const document = await prisma.document.findFirst({
        where: { id, tenantId: session.tenantId, isDeleted: false },
    });

    if (!document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    try {
        // Update status
        const updated = await updateWithOptimisticLock(
            prisma.document,
            { id, tenantId: session.tenantId },
            {
                currentVersion: version,
                data: {
                    status: 'REJECTED',
                    rejectionReason: reason,
                    verifiedById: null, // Reset verification if it was verified
                    verifiedAt: null,
                }
            },
            'Document'
        );

        // Log action
        await prisma.documentAccessLog.create({
            data: {
                documentId: id,
                userId: session.userId,
                action: 'REJECT',
                ipAddress: req.headers.get('x-forwarded-for'),
                userAgent: req.headers.get('user-agent'),
            },
        });

        return NextResponse.json({ success: true, document: updated });
    } catch (error) {
        const lockError = handleOptimisticLockError(error);
        if (lockError) {
            return NextResponse.json(lockError, { status: 409 });
        }
        throw error;
    }
};

export const POST = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 30 }, postHandler);
