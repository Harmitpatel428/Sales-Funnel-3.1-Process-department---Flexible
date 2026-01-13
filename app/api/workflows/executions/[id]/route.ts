/**
 * Individual Workflow Execution API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';
import { WorkflowExecutor } from '@/lib/workflows/executor';

const prisma = new PrismaClient();

interface RouteParams {
    params: { id: string };
}

// GET /api/workflows/executions/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const execution = await prisma.workflowExecution.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId },
            include: {
                workflow: {
                    include: { steps: { orderBy: { stepOrder: 'asc' } } }
                },
                approvalRequests: {
                    include: { requestedBy: { select: { id: true, name: true } } }
                }
            }
        });

        if (!execution) {
            return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }

        return NextResponse.json({
            ...execution,
            executionLog: JSON.parse(execution.executionLog),
            triggerData: JSON.parse(execution.triggerData)
        });
    } catch (error) {
        console.error('Failed to get execution:', error);
        return NextResponse.json({ error: 'Failed to get execution' }, { status: 500 });
    }
}

// POST /api/workflows/executions/[id]/retry
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const execution = await prisma.workflowExecution.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId }
        });

        if (!execution) {
            return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }

        if (execution.status !== 'FAILED') {
            return NextResponse.json({ error: 'Only failed executions can be retried' }, { status: 400 });
        }

        const newExecutionId = await WorkflowExecutor.retryExecution(params.id, session.user.id);

        return NextResponse.json({ success: true, newExecutionId });
    } catch (error) {
        console.error('Failed to retry execution:', error);
        return NextResponse.json({ error: 'Failed to retry execution' }, { status: 500 });
    }
}

// DELETE /api/workflows/executions/[id] - Cancel execution
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const execution = await prisma.workflowExecution.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId }
        });

        if (!execution) {
            return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }

        if (!['PENDING', 'RUNNING', 'PAUSED'].includes(execution.status)) {
            return NextResponse.json({ error: 'Cannot cancel completed/failed execution' }, { status: 400 });
        }

        await WorkflowExecutor.cancelExecution(params.id, session.user.id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to cancel execution:', error);
        return NextResponse.json({ error: 'Failed to cancel execution' }, { status: 500 });
    }
}
