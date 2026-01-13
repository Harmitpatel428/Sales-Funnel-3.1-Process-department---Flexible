/**
 * Workflow Test API Route
 * Test workflow with sample data without persisting changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';
import { ConditionEvaluator } from '@/lib/workflows/conditions';
import { ActionType } from '@/lib/workflows/actions';

const prisma = new PrismaClient();

interface RouteParams {
    params: { id: string };
}

// POST /api/workflows/[id]/test
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workflow = await prisma.workflow.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId },
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
            { id: session.user.id, name: session.user.name },
            { id: session.user.tenantId }
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
    } catch (error) {
        console.error('Failed to test workflow:', error);
        return NextResponse.json({ error: 'Failed to test workflow' }, { status: 500 });
    }
}
