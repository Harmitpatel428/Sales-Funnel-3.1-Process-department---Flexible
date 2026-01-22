/**
 * Approval API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApprovalHandler } from '@/lib/workflows/approval-handler';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/approvals
 * List pending approvals for current user
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const approvals = await ApprovalHandler.getPendingApprovals(
            session.userId,
            session.tenantId
        );

        return NextResponse.json({ approvals });
    }
);
