/**
 * Workflow Detail API Routes
 * GET, PUT, DELETE for individual workflows
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { validateWorkflow } from '@/lib/validation/workflow-schemas';
import { getServerSession } from '@/lib/auth';

const prisma = new PrismaClient();

interface RouteParams {
    params: { id: string };
}

// GET /api/workflows/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workflow = await prisma.workflow.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId },
            include: {
                steps: { orderBy: { stepOrder: 'asc' } },
                createdBy: { select: { id: true, name: true, email: true } },
                executions: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: { id: true, status: true, startedAt: true, completedAt: true }
                }
            }
        });

        if (!workflow) {
            return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
        }

        return NextResponse.json(workflow);
    } catch (error) {
        console.error('Failed to get workflow:', error);
        return NextResponse.json({ error: 'Failed to get workflow' }, { status: 500 });
    }
}

// PUT /api/workflows/[id]
export async function PUT(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const existing = await prisma.workflow.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId }
        });

        if (!existing) {
            return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
        }

        const body = await request.json();
        const validation = validateWorkflow(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation failed', details: validation.error.errors }, { status: 400 });
        }

        const data = validation.data;

        // Delete existing steps and recreate
        await prisma.workflowStep.deleteMany({ where: { workflowId: params.id } });

        const workflow = await prisma.workflow.update({
            where: { id: params.id },
            data: {
                name: data.name,
                description: data.description,
                triggerType: data.triggerType,
                triggerConfig: JSON.stringify(data.triggerConfig),
                entityType: data.entityType,
                priority: data.priority,
                steps: {
                    create: data.steps.map((step, index) => ({
                        stepType: step.stepType,
                        stepOrder: step.stepOrder || index,
                        actionType: step.actionType,
                        actionConfig: JSON.stringify(step.actionConfig),
                        conditionType: step.conditionType,
                        conditionConfig: JSON.stringify(step.conditionConfig),
                        parentStepId: step.parentStepId
                    }))
                }
            },
            include: { steps: true }
        });

        await prisma.auditLog.create({
            data: {
                actionType: 'WORKFLOW_UPDATED',
                entityType: 'WORKFLOW',
                entityId: workflow.id,
                description: `Updated workflow "${workflow.name}"`,
                performedById: session.user.id,
                tenantId: session.user.tenantId,
                beforeValue: JSON.stringify(existing),
                afterValue: JSON.stringify(workflow)
            }
        });

        return NextResponse.json(workflow);
    } catch (error) {
        console.error('Failed to update workflow:', error);
        return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
    }
}

// DELETE /api/workflows/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workflow = await prisma.workflow.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId }
        });

        if (!workflow) {
            return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
        }

        await prisma.workflow.delete({ where: { id: params.id } });

        await prisma.auditLog.create({
            data: {
                actionType: 'WORKFLOW_DELETED',
                entityType: 'WORKFLOW',
                entityId: params.id,
                description: `Deleted workflow "${workflow.name}"`,
                performedById: session.user.id,
                tenantId: session.user.tenantId,
                beforeValue: JSON.stringify(workflow)
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete workflow:', error);
        return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 });
    }
}
