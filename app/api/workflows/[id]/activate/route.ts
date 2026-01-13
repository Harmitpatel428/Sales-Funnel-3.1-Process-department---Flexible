/**
 * Workflow Activate/Deactivate API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';

const prisma = new PrismaClient();

interface RouteParams {
    params: { id: string };
}

// POST /api/workflows/[id]/activate
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action') || 'activate';

        const workflow = await prisma.workflow.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId }
        });

        if (!workflow) {
            return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
        }

        const isActive = action === 'activate';

        await prisma.workflow.update({
            where: { id: params.id },
            data: { isActive }
        });

        await prisma.auditLog.create({
            data: {
                actionType: isActive ? 'WORKFLOW_ACTIVATED' : 'WORKFLOW_DEACTIVATED',
                entityType: 'WORKFLOW',
                entityId: params.id,
                description: `${isActive ? 'Activated' : 'Deactivated'} workflow "${workflow.name}"`,
                performedById: session.user.id,
                tenantId: session.user.tenantId
            }
        });

        return NextResponse.json({ success: true, isActive });
    } catch (error) {
        console.error('Failed to toggle workflow:', error);
        return NextResponse.json({ error: 'Failed to toggle workflow' }, { status: 500 });
    }
}
