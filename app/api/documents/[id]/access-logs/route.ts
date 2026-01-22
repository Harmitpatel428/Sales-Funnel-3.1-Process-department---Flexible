/**
 * Document Access Logs API
 * GET /api/documents/[id]/access-logs - View access history for a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';

const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const { id } = params;

    // 1. Verify Document Exists & Belongs to Tenant (Strict Isolation)
    const document = await prisma.document.findUnique({
        where: {
            id,
            tenantId: session.tenantId,
            isDeleted: false
        },
        select: { id: true, uploadedById: true }
    });

    if (!document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 2. Permission Check
    // Require ADMIN, PROCESS_MANAGER roles, or DOCUMENTS.VIEW_ALL permission
    // We can use session.user.role if it's available in CustomSessionData or fetch user.
    // The previous code fetched user to check role. context.session has userId and tenantId.
    // Let's fetch the user role to be safe/consistent with previous logic.
    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { role: true }
    });

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
};

export const GET = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 50 }, getHandler);
