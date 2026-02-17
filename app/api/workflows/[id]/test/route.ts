/**
 * Workflow Test API Route
 * Test workflow with sample data without persisting changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ConditionEvaluator } from '@/lib/workflows/conditions';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';
import { ApiHandler, ApiContext } from '@/lib/api/types';

// POST /api/workflows/[id]/test
const postHandler: ApiHandler = async (request: NextRequest, apiContext: ApiContext) => {
    const user = await prisma.user.findUnique({ where: { id: apiContext.session.userId } });

    const workflow = await prisma.workflow.findFirst({
        where: { id: apiContext.params.id, tenantId: apiContext.session.tenantId },
        include: { steps: { orderBy: { stepOrder: 'asc' } } }
    });

    if (!workflow) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const body = await request.json();
    const { entityData, triggerData } = body;

    // Build test context
    const context = ConditionEvaluator.buildContext(
        entityData || {},
        triggerData?.oldData,
        { id: apiContext.session.userId, name: user?.name || 'Test User' },
        { id: apiContext.session.tenantId }
    );

    // Simulate execution
    const results: Array<{
        stepId: string;
        stepType: string;
        actionType?: string;
        wouldExecute: boolean;
        conditionResult?: boolean;
        description: string;
    }> = [];

    for (const step of workflow.steps) {
        if (step.stepType === 'CONDITION') {
            const conditionConfig = JSON.parse(step.conditionConfig);
            const conditionResult = ConditionEvaluator.evaluate(conditionConfig, context);

            results.push({
                stepId: step.id,
                stepType: 'CONDITION',
                wouldExecute: conditionResult,
                conditionResult,
                description: `Condition ${step.conditionType}: ${conditionResult ? 'PASSED' : 'FAILED'}`
            });
        } else if (step.stepType === 'ACTION') {
            const actionConfig = JSON.parse(step.actionConfig);

            results.push({
                stepId: step.id,
                stepType: 'ACTION',
                actionType: step.actionType || undefined,
                wouldExecute: true,
                description: `Would execute ${step.actionType} action with config: ${JSON.stringify(actionConfig)}`
            });
        }
    }

    return NextResponse.json({
        success: true,
        workflowId: workflow.id,
        workflowName: workflow.name,
        triggerType: workflow.triggerType,
        entityType: workflow.entityType,
        testResults: results,
        testContext: {
            entityData: entityData || {},
            triggerData: triggerData || {}
        }
    });
};

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100, permissions: [PERMISSIONS.WORKFLOWS_TEST] },
    postHandler
);


