/**
 * SLA Policies API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';
import { validateSLAPolicy } from '@/lib/validation/workflow-schemas';

const prisma = new PrismaClient();

// GET /api/sla/policies
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const policies = await prisma.sLAPolicy.findMany({
            where: { tenantId: session.user.tenantId },
            include: {
                createdBy: { select: { id: true, name: true } },
                escalationWorkflow: { select: { id: true, name: true } },
                _count: { select: { trackers: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ policies });
    } catch (error) {
        console.error('Failed to list SLA policies:', error);
        return NextResponse.json({ error: 'Failed to list SLA policies' }, { status: 500 });
    }
}

// POST /api/sla/policies
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = validateSLAPolicy(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation failed', details: validation.error.errors }, { status: 400 });
        }

        const policy = await prisma.sLAPolicy.create({
            data: {
                tenantId: session.user.tenantId,
                createdById: session.user.id,
                ...validation.data
            }
        });

        return NextResponse.json(policy, { status: 201 });
    } catch (error) {
        console.error('Failed to create SLA policy:', error);
        return NextResponse.json({ error: 'Failed to create SLA policy' }, { status: 500 });
    }
}
