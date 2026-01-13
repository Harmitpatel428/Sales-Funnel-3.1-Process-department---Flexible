/**
 * Document Verification API
 * POST /api/documents/[id]/verify - Verify a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Authenticate
        const session = await getServerSession(authOptions);
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

        const document = await prisma.document.findFirst({
            where: { id, tenantId: user.tenantId, isDeleted: false },
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Update status
        const updated = await prisma.document.update({
            where: { id },
            data: {
                status: 'VERIFIED',
                verifiedById: user.id,
                verifiedAt: new Date(),
                rejectionReason: null, // Clear any previous rejection
            },
            include: {
                verifiedBy: { select: { id: true, name: true } }
            }
        });

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
        console.error('Verify document error:', error);
        return NextResponse.json({ error: 'Failed to verify document' }, { status: 500 });
    }
}
