/**
 * Lead Scoring API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';
import { LeadScoringEngine } from '@/lib/workflows/lead-scoring';

const prisma = new PrismaClient();

// GET /api/lead-scoring/config
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: session.user.tenantId }
        });

        const workflowSettings = JSON.parse(tenant?.workflowSettings || '{}');
        const scoringConfig = workflowSettings.leadScoring || {
            enabled: true,
            rules: [],
            autoUpdatePriority: true,
            thresholds: { HIGH: 70, MEDIUM: 40, LOW: 0 }
        };

        return NextResponse.json(scoringConfig);
    } catch (error) {
        console.error('Failed to get scoring config:', error);
        return NextResponse.json({ error: 'Failed to get scoring config' }, { status: 500 });
    }
}

// PUT /api/lead-scoring/config
export async function PUT(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const tenant = await prisma.tenant.findUnique({
            where: { id: session.user.tenantId }
        });

        const workflowSettings = JSON.parse(tenant?.workflowSettings || '{}');
        workflowSettings.leadScoring = body;

        await prisma.tenant.update({
            where: { id: session.user.tenantId },
            data: { workflowSettings: JSON.stringify(workflowSettings) }
        });

        return NextResponse.json({ success: true, config: body });
    } catch (error) {
        console.error('Failed to update scoring config:', error);
        return NextResponse.json({ error: 'Failed to update scoring config' }, { status: 500 });
    }
}

// POST /api/lead-scoring/bulk-calculate
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const count = await LeadScoringEngine.bulkCalculateScores(session.user.tenantId);

        return NextResponse.json({ success: true, calculated: count });
    } catch (error) {
        console.error('Failed to bulk calculate:', error);
        return NextResponse.json({ error: 'Failed to bulk calculate' }, { status: 500 });
    }
}
