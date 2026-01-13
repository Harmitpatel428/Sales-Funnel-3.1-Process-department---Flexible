
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { requirePermissions } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const permError = await requirePermissions([PERMISSIONS.USERS_IMPERSONATE])(req);
    if (permError) return permError;

    const { action, targetUserId, targetRoleId } = await req.json();

    if (!['start', 'stop'].includes(action)) {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    try {
        const actionType = action === 'start' ? 'PERMISSION_TEST_STARTED' : 'PERMISSION_TEST_ENDED';
        const description = action === 'start'
            ? `Started viewing as user ${targetUserId || 'N/A'} (Role: ${targetRoleId || 'N/A'})`
            : 'Stopped viewing as user';

        await prisma.auditLog.create({
            data: {
                actionType,
                entityType: 'permission_test',
                entityId: targetUserId || session.userId, // logical entry
                description,
                performedById: session.userId,
                tenantId: session.tenantId,
                metadata: JSON.stringify({ targetUserId, targetRoleId })
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Audit log error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
