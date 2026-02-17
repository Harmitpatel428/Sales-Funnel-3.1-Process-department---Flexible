import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApprovalHandler } from '@/lib/workflows/approval-handler';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * GET /api/approvals
 * List pending approvals for current user
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.APPROVALS_VIEW]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const approvals = await ApprovalHandler.getPendingApprovals(
            session.userId,
            session.tenantId
        );

        return NextResponse.json({ success: true, data: approvals });
    }
);
