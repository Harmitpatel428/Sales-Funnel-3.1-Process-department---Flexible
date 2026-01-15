/**
 * Document Verification API
 * POST /api/documents/[id]/verify - Verify a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/app/api/auth/[...nextauth]/route';

import { z } from 'zod';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';

const VerifySchema = z.object({
    version: z.number().int().min(1, 'Version is required for updates'),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Authenticate
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify permissions (TODO: Use robust RBAC check)
        // For now assuming any auth user with access to tenant can verify or stricter
        // In real app: requirePermissions(['documents.verify'])

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, tenantId: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const body = await req.json();
        const { version } = VerifySchema.parse(body);

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
                        status: 'VERIFIED',
                        verifiedById: user.id,
                        verifiedAt: new Date(),
                        rejectionReason: null, // Clear any previous rejection
                    }
                },
                'Document'
            );

            // Log action
            await prisma.documentAccessLog.create({
                data: {
                    documentId: id,
                    userId: user.id,
                    action: 'VERIFY',
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
        console.error('Verify document error:', error);
        return NextResponse.json({ error: 'Failed to verify document' }, { status: 500 });
    }
}
