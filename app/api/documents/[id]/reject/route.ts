/**
 * Document Rejection API
 * POST /api/documents/[id]/reject - Reject a document with reason
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';

import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';

const RejectSchema = z.object({
    reason: z.string().min(1, 'Rejection reason is required'),
    version: z.number().int().min(1, 'Version is required for updates'),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, tenantId: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Parse Body
        const body = await req.json();
        const { reason, version } = RejectSchema.parse(body);

        const document = await prisma.document.findFirst({
            where: { id, tenantId: user.tenantId, isDeleted: false },
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        try {
            // Update status
            const updated = await updateWithOptimisticLock(
                prisma.document,
                { id, tenantId: user.tenantId },
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
                    userId: user.id,
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

    } catch (error) {
        console.error('Reject document error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to reject document' }, { status: 500 });
    }
}
