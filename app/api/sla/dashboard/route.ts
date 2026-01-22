/**
 * SLA Dashboard API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { SLATrackerService } from '@/lib/workflows/sla-tracker';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/sla/dashboard
 * Get SLA dashboard data
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const dashboard = await SLATrackerService.getDashboardData(session.tenantId);

        return NextResponse.json(dashboard);
    }
);
