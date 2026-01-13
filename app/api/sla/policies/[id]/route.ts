/**
 * Individual SLA Policy API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';
import { validateSLAPolicy } from '@/lib/validation/workflow-schemas';

const prisma = new PrismaClient();

interface RouteParams {
    params: { id: string };
}

// GET /api/sla/policies/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const policy = await prisma.sLAPolicy.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId },
            include: {
                createdBy: { select: { id: true, name: true } },
                escalationWorkflow: { select: { id: true, name: true } }
            }
        });

        if (!policy) {
            return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
        }

        return NextResponse.json(policy);
    } catch (error) {
        console.error('Failed to get SLA policy:', error);
        return NextResponse.json({ error: 'Failed to get SLA policy' }, { status: 500 });
    }
}

// PUT /api/sla/policies/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const existing = await prisma.sLAPolicy.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId }
        });

        if (!existing) {
            return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
        }

        const body = await request.json();
        const validation = validateSLAPolicy(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
        }

        const policy = await prisma.sLAPolicy.update({
            where: { id: params.id },
            data: validation.data
        });

        return NextResponse.json(policy);
    } catch (error) {
        console.error('Failed to update SLA policy:', error);
        return NextResponse.json({ error: 'Failed to update SLA policy' }, { status: 500 });
    }
}

// DELETE /api/sla/policies/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const existing = await prisma.sLAPolicy.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId }
        });

        if (!existing) {
            return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
        }

        await prisma.sLAPolicy.delete({ where: { id: params.id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete SLA policy:', error);
        return NextResponse.json({ error: 'Failed to delete SLA policy' }, { status: 500 });
    }
}
