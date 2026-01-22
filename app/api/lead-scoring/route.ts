/**
 * Lead Scoring API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { LeadScoringEngine } from '@/lib/workflows/lead-scoring';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/lead-scoring/config
 * Get lead scoring configuration
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: session.tenantId }
        });

        const workflowSettings = JSON.parse(tenant?.workflowSettings || '{}');
        const scoringConfig = workflowSettings.leadScoring || {
            enabled: true,
            rules: [],
            autoUpdatePriority: true,
            thresholds: { HIGH: 70, MEDIUM: 40, LOW: 0 }
        };

        return NextResponse.json(scoringConfig);
    }
);

/**
 * PUT /api/lead-scoring/config
 * Update lead scoring configuration
 */
export const PUT = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const body = await req.json();

        const tenant = await prisma.tenant.findUnique({
            where: { id: session.tenantId }
        });

        const workflowSettings = JSON.parse(tenant?.workflowSettings || '{}');
        workflowSettings.leadScoring = body;

        await prisma.tenant.update({
            where: { id: session.tenantId },
            data: { workflowSettings: JSON.stringify(workflowSettings) }
        });

        return NextResponse.json({ success: true, config: body });
    }
);

/**
 * POST /api/lead-scoring/bulk-calculate
 * Bulk calculate lead scores for tenant
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const count = await LeadScoringEngine.bulkCalculateScores(session.tenantId);

        return NextResponse.json({ success: true, calculated: count });
    }
);
