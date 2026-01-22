/**
 * Workflow API Routes
 * CRUD operations for workflows
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateWorkflow } from '@/lib/validation/workflow-schemas';
import { withApiHandler } from '@/lib/api/withApiHandler';

// GET /api/workflows - List workflows
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (request: NextRequest, context) => {
        const { searchParams } = new URL(request.url);
        const entityType = searchParams.get('entityType');
        const triggerType = searchParams.get('triggerType');
        const isActive = searchParams.get('isActive');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        const where: Record<string, unknown> = { tenantId: context.session.tenantId };
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
    }
);

// POST /api/workflows - Create workflow
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (request: NextRequest, context) => {
        const body = await request.json();
        const validation = validateWorkflow(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Validation failed', details: validation.error.errors }, { status: 400 });
        }

        const data = validation.data;

        const workflow = await prisma.workflow.create({
            data: {
                tenantId: context.session.tenantId,
                name: data.name,
                description: data.description,
                triggerType: data.triggerType,
                triggerConfig: JSON.stringify(data.triggerConfig),
                entityType: data.entityType,
                isActive: data.isActive,
                priority: data.priority,
                createdById: context.session.userId,
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
                performedById: context.session.userId,
                tenantId: context.session.tenantId,
                afterValue: JSON.stringify(workflow)
            }
        });

        return NextResponse.json(workflow, { status: 201 });
    }
);

