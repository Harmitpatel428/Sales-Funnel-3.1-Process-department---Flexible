/**
 * Document Access Logs API
 * GET /api/documents/[id]/access-logs - View access history for a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check permissions and user
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, tenantId: true }
        });

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Verify Document Exists & Belongs to Tenant (Strict Isolation)
        const document = await prisma.document.findUnique({
            where: {
                id,
                tenantId: user.tenantId,
                isDeleted: false
            },
            select: { id: true, uploadedById: true }
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // 2. Permission Check
        // Require ADMIN, PROCESS_MANAGER roles, or DOCUMENTS.VIEW_ALL permission
        const allowedRoles = ['ADMIN', 'PROCESS_MANAGER', 'PROCESS_EXECUTIVE'];
        const isAllowed = allowedRoles.includes(user.role);

        if (!isAllowed) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const logs = await prisma.documentAccessLog.findMany({
            where: { documentId: id },
            include: {
                user: {
                    select: { id: true, name: true, email: true, role: true }
                }
            },
            orderBy: { accessedAt: 'desc' },
            take: 100, // Limit to last 100 entries for performance
        });

        return NextResponse.json({ logs });
    } catch (error) {
        console.error('Access logs error:', error);
        return NextResponse.json({ error: 'Failed to fetch access logs' }, { status: 500 });
    }
}
