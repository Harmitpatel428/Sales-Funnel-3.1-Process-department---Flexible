/**
 * Workflow Detail API Routes
 * GET, PUT, DELETE for individual workflows
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateWorkflow } from '@/lib/validation/workflow-schemas';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';
import { ApiHandler, ApiContext } from '@/lib/api/types';

// GET /api/workflows/[id]
const getHandler: ApiHandler = async (request: NextRequest, context: ApiContext) => {
    const workflow = await prisma.workflow.findFirst({
        where: { id: context.params.id, tenantId: context.session.tenantId },
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

    return NextResponse.json({ success: true, ...workflow });
};

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100, permissions: [PERMISSIONS.WORKFLOWS_VIEW] },
    getHandler
);

// PUT /api/workflows/[id]
const putHandler: ApiHandler = async (request: NextRequest, context: ApiContext) => {
    const existing = await prisma.workflow.findFirst({
        where: { id: context.params.id, tenantId: context.session.tenantId }
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
    await prisma.workflowStep.deleteMany({ where: { workflowId: context.params.id } });

    const workflow = await prisma.workflow.update({
        where: { id: context.params.id },
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
            performedById: context.session.userId,
            tenantId: context.session.tenantId,
            beforeValue: JSON.stringify(existing),
            afterValue: JSON.stringify(workflow)
        }
    });

    return NextResponse.json({ success: true, ...workflow });
};

export const PUT = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100, permissions: [PERMISSIONS.WORKFLOWS_EDIT] },
    putHandler
);

// DELETE /api/workflows/[id]
const deleteHandler: ApiHandler = async (request: NextRequest, context: ApiContext) => {
    const workflow = await prisma.workflow.findFirst({
        where: { id: context.params.id, tenantId: context.session.tenantId }
    });

    if (!workflow) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    await prisma.workflow.delete({ where: { id: context.params.id } });

    await prisma.auditLog.create({
        data: {
            actionType: 'WORKFLOW_DELETED',
            entityType: 'WORKFLOW',
            entityId: context.params.id,
            description: `Deleted workflow "${workflow.name}"`,
            performedById: context.session.userId,
            tenantId: context.session.tenantId,
            beforeValue: JSON.stringify(workflow)
        }
    });

    return NextResponse.json({ success: true });
};

export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100, permissions: [PERMISSIONS.WORKFLOWS_DELETE] },
    deleteHandler
);


