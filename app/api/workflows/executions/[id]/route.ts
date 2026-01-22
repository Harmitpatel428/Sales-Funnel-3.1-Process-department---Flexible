/**
 * Individual Workflow Execution API Routes
 */

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { WorkflowExecutor } from '@/lib/workflows/executor';
import { withApiHandler } from '@/lib/api/withApiHandler';

// GET /api/workflows/executions/[id]
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (request: NextRequest, context) => {
        const execution = await prisma.workflowExecution.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId },
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
    }
);

// POST /api/workflows/executions/[id]/retry
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (request: NextRequest, context) => {
        const execution = await prisma.workflowExecution.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId }
        });

        if (!execution) {
            return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }

        if (execution.status !== 'FAILED') {
            return NextResponse.json({ error: 'Only failed executions can be retried' }, { status: 400 });
        }

        const newExecutionId = await WorkflowExecutor.retryExecution(context.params.id, context.session.userId);

        return NextResponse.json({ success: true, newExecutionId });
    }
);

// DELETE /api/workflows/executions/[id] - Cancel execution
export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (request: NextRequest, context) => {
        const execution = await prisma.workflowExecution.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId }
        });

        if (!execution) {
            return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }

        if (!['PENDING', 'RUNNING', 'PAUSED'].includes(execution.status)) {
            return NextResponse.json({ error: 'Cannot cancel completed/failed execution' }, { status: 400 });
        }

        await WorkflowExecutor.cancelExecution(context.params.id, context.session.userId);

        return NextResponse.json({ success: true });
    }
);

