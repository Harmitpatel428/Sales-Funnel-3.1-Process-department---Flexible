/**
 * Workflow Activate/Deactivate API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiHandler } from '@/lib/api/withApiHandler';

// POST /api/workflows/[id]/activate
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (request: NextRequest, context) => {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action') || 'activate';

        const workflow = await prisma.workflow.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId }
        });

        if (!workflow) {
            return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
        }

        const isActive = action === 'activate';

        await prisma.workflow.update({
            where: { id: context.params.id },
            data: { isActive }
        });

        await prisma.auditLog.create({
            data: {
                actionType: isActive ? 'WORKFLOW_ACTIVATED' : 'WORKFLOW_DEACTIVATED',
                entityType: 'WORKFLOW',
                entityId: context.params.id,
                description: `${isActive ? 'Activated' : 'Deactivated'} workflow "${workflow.name}"`,
                performedById: context.session.userId,
                tenantId: context.session.tenantId
            }
        });

        return NextResponse.json({ success: true, isActive });
    }
);
