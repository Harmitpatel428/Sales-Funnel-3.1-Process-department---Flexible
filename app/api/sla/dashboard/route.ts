import { NextRequest, NextResponse } from 'next/server';
import { SLATrackerService } from '@/lib/workflows/sla-tracker';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * GET /api/sla/dashboard
 * Get SLA dashboard data
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SLA_VIEW]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const dashboard = await SLATrackerService.getDashboardData(session.tenantId);

        return NextResponse.json({ success: true, data: dashboard });
    }
);
