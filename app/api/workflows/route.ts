/**
 * Workflow API Routes
 * CRUD operations for workflows
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { validateWorkflow, WorkflowSchema } from '@/lib/validation/workflow-schemas';
import { getServerSession } from '@/lib/auth';

const prisma = new PrismaClient();

// GET /api/workflows - List workflows
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const entityType = searchParams.get('entityType');
        const triggerType = searchParams.get('triggerType');
        const isActive = searchParams.get('isActive');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        const where: Record<string, unknown> = { tenantId: session.user.tenantId };
        if (entityType) where.entityType = entityType;
        if (triggerType) where.triggerType = triggerType;
        if (isActive !== null) where.isActive = isActive === 'true';

        const [workflows, total] = await Promise.all([
            prisma.workflow.findMany({
                where,
                include: {
                    createdBy: { select: { id: true, name: true, email: true } },
                    _count: { select: { steps: true, executions: true } }
                },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.workflow.count({ where })
        ]);

        return NextResponse.json({
            workflows,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Failed to list workflows:', error);
        return NextResponse.json({ error: 'Failed to list workflows' }, { status: 500 });
    }
}

// POST /api/workflows - Create workflow
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = validateWorkflow(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation failed', details: validation.error.errors }, { status: 400 });
        }

        const data = validation.data;

        const workflow = await prisma.workflow.create({
            data: {
                tenantId: session.user.tenantId,
                name: data.name,
                description: data.description,
                triggerType: data.triggerType,
                triggerConfig: JSON.stringify(data.triggerConfig),
                entityType: data.entityType,
                isActive: data.isActive,
                priority: data.priority,
                createdById: session.user.id,
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
            include: { steps: true, createdBy: { select: { id: true, name: true } } }
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                actionType: 'WORKFLOW_CREATED',
                entityType: 'WORKFLOW',
                entityId: workflow.id,
                description: `Created workflow "${workflow.name}"`,
                performedById: session.user.id,
                tenantId: session.user.tenantId,
                afterValue: JSON.stringify(workflow)
            }
        });

        return NextResponse.json(workflow, { status: 201 });
    } catch (error) {
        console.error('Failed to create workflow:', error);
        return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
    }
}
