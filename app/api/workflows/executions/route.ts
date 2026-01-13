/**
 * Workflow Executions API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';

const prisma = new PrismaClient();

// GET /api/workflows/executions
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const workflowId = searchParams.get('workflowId');
        const status = searchParams.get('status');
        const entityType = searchParams.get('entityType');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        const where: Record<string, unknown> = { tenantId: session.user.tenantId };
        if (workflowId) where.workflowId = workflowId;
        if (status) where.status = status;
        if (entityType) where.entityType = entityType;
        if (startDate || endDate) {
            where.startedAt = {};
            if (startDate) (where.startedAt as Record<string, Date>).gte = new Date(startDate);
            if (endDate) (where.startedAt as Record<string, Date>).lte = new Date(endDate);
        }

        const [executions, total] = await Promise.all([
            prisma.workflowExecution.findMany({
                where,
                include: {
                    workflow: { select: { id: true, name: true, triggerType: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.workflowExecution.count({ where })
        ]);

        return NextResponse.json({
            executions,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Failed to list executions:', error);
        return NextResponse.json({ error: 'Failed to list executions' }, { status: 500 });
    }
}
