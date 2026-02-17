import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApprovalHandler } from '@/lib/workflows/approval-handler';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * GET /api/approvals/[id]
 * Get a specific approval request
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.APPROVALS_VIEW]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const approval = await prisma.approvalRequest.findFirst({
            where: { id, tenantId: session.tenantId },
            include: {
                requestedBy: { select: { id: true, name: true, email: true } },
                workflowExecution: { include: { workflow: true } }
            }
        });

        if (!approval) {
            return notFoundResponse('Approval');
        }

        return NextResponse.json({
            success: true,
            data: {
                ...approval,
                approverIds: JSON.parse(approval.approverIds),
                approvedBy: JSON.parse(approval.approvedBy),
                metadata: JSON.parse(approval.metadata)
            }
        });
    }
);

/**
 * POST /api/approvals/[id]
 * Approve or reject an approval request
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.APPROVALS_APPROVE]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const body = await req.json();
        const { action, comments } = body;

        if (!['approve', 'reject'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        const result = await ApprovalHandler.submitApproval(
            id,
            session.userId,
            action === 'approve' ? 'APPROVE' : 'REJECT',
            comments
        );

        return NextResponse.json({ success: true, ...result });
    }
);

/**
 * DELETE /api/approvals/[id]
 * Cancel an approval request
 */
export const DELETE = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.APPROVALS_MANAGE]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        await ApprovalHandler.cancelApproval(id, session.userId);

        return NextResponse.json({ success: true });
    }
);
