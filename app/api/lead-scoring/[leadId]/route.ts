/**
 * Individual Lead Score API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { LeadScoringEngine } from '@/lib/workflows/lead-scoring';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/lead-scoring/[leadId]
 * Get score breakdown for a lead
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { leadId } = await params;

        const lead = await prisma.lead.findFirst({
            where: { id: leadId, tenantId: session.tenantId }
        });

        if (!lead) {
            return notFoundResponse('Lead');
        }

        const scoreResult = await LeadScoringEngine.getScoreBreakdown(leadId);

        if (!scoreResult) {
            // Calculate if not exists
            const newScore = await LeadScoringEngine.calculateScore(
                leadId,
                session.tenantId
            );
            return NextResponse.json(newScore);
        }

        return NextResponse.json(scoreResult);
    }
);

/**
 * POST /api/lead-scoring/[leadId]/recalculate
 * Recalculate score for a lead
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { leadId } = await params;

        const lead = await prisma.lead.findFirst({
            where: { id: leadId, tenantId: session.tenantId }
        });

        if (!lead) {
            return notFoundResponse('Lead');
        }

        const result = await LeadScoringEngine.calculateScore(
            leadId,
            session.tenantId
        );

        return NextResponse.json(result);
    }
);
