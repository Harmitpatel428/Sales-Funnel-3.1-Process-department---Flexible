/**
 * Document Bulk Operations API
 * POST /api/documents/bulk - Perform actions on multiple documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';

const BulkActionSchema = z.object({
    action: z.enum(['DELETE', 'VERIFY', 'REJECT', 'DOWNLOAD_ZIP']),
    documentIds: z.array(z.string()).min(1),
    reason: z.string().optional(), // For rejection
});

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
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

        switch (action) {
            case 'DELETE':
                // Soft delete all
                result = await prisma.document.updateMany({
                    where: { id: { in: documentIds } },
                    data: {
                        isDeleted: true,
                        deletedById: user.id,
                        deletedAt: new Date(),
                    },
                });

                // Log
                await prisma.documentAccessLog.createMany({
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
                result = await prisma.document.updateMany({
                    where: { id: { in: documentIds } },
                    data: {
                        status: 'VERIFIED',
                        verifiedById: user.id,
                        verifiedAt: new Date(),
                        rejectionReason: null,
                    },
                });

                await prisma.documentAccessLog.createMany({
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
                    return NextResponse.json({ error: 'Reason required for rejection' }, { status: 400 });
                }
                result = await prisma.document.updateMany({
                    where: { id: { in: documentIds } },
                    data: {
                        status: 'REJECTED',
                        rejectionReason: reason,
                        verifiedById: null,
                        verifiedAt: null,
                    },
                });

                await prisma.documentAccessLog.createMany({
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
                // For Zip download, we would typically generate a background job
                // or return a stream. Implementing a full zip stream here is complex.
                // For MVP, we'll return a "Not Implemented" or just list of download URLs.
                return NextResponse.json({
                    error: 'Bulk ZIP download not yet implemented. Please download files individually.',
                    status: 'NOT_IMPLEMENTED'
                }, { status: 501 });
        }

        return NextResponse.json({
            success: true,
            action,
            count: result?.count || 0,
        });

    } catch (error) {
        console.error('Bulk action error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'Bulk action failed' }, { status: 500 });
    }
}
