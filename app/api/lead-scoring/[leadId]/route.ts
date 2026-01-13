/**
 * Individual Lead Score API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';
import { LeadScoringEngine } from '@/lib/workflows/lead-scoring';

const prisma = new PrismaClient();

interface RouteParams {
    params: { leadId: string };
}

// GET /api/lead-scoring/[leadId]
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const lead = await prisma.lead.findFirst({
            where: { id: params.leadId, tenantId: session.user.tenantId }
        });

        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        const scoreResult = await LeadScoringEngine.getScoreBreakdown(params.leadId);

        if (!scoreResult) {
            // Calculate if not exists
            const newScore = await LeadScoringEngine.calculateScore(
                params.leadId,
                session.user.tenantId
            );
            return NextResponse.json(newScore);
        }

        return NextResponse.json(scoreResult);
    } catch (error) {
        console.error('Failed to get lead score:', error);
        return NextResponse.json({ error: 'Failed to get lead score' }, { status: 500 });
    }
}

// POST /api/lead-scoring/[leadId]/recalculate
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const lead = await prisma.lead.findFirst({
            where: { id: params.leadId, tenantId: session.user.tenantId }
        });

        if (!lead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        const result = await LeadScoringEngine.calculateScore(
            params.leadId,
            session.user.tenantId
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to recalculate score:', error);
        return NextResponse.json({ error: 'Failed to recalculate score' }, { status: 500 });
    }
}
