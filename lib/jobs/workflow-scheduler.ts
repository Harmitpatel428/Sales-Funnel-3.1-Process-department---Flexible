/**
 * Workflow Scheduler Job
 * Handles scheduled (cron-based) workflow triggers
 */

import Queue from 'bull';
import { PrismaClient } from '@prisma/client';
import { TriggerManager, TriggerType, EntityType, TriggerData } from '../workflows/triggers';
import * as cronParser from 'cron-parser';

const prisma = new PrismaClient();
let schedulerQueue: Queue.Queue | null = null;

export function getSchedulerQueue(): Queue.Queue {
    if (!schedulerQueue) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        schedulerQueue = new Queue('workflow-scheduler', redisUrl, {
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 100,
                removeOnFail: 50
            }
        });

        // Process CHECK_SCHEDULED_WORKFLOWS job - runs every minute
        schedulerQueue.process('CHECK_SCHEDULED_WORKFLOWS', 1, async () => {
            return await checkScheduledWorkflows();
        });

        // Process EXECUTE_SCHEDULED_WORKFLOW job
        schedulerQueue.process('EXECUTE_SCHEDULED_WORKFLOW', 5, async (job) => {
            const { workflowId, tenantId, entityType } = job.data;
            return await executeScheduledWorkflow(workflowId, tenantId, entityType);
        });

        schedulerQueue.on('error', (error) => {
            console.error('Workflow scheduler queue error:', error);
        });
    }

    return schedulerQueue;
}

async function checkScheduledWorkflows(): Promise<{ triggered: number }> {
    const now = new Date();
    let triggered = 0;

    // Get all active scheduled workflows
    const scheduledWorkflows = await prisma.workflow.findMany({
        where: {
            isActive: true,
            triggerType: TriggerType.SCHEDULED
        }
    });

    for (const workflow of scheduledWorkflows) {
        const triggerConfig = JSON.parse(workflow.triggerConfig);
        const cronExpression = triggerConfig.cronExpression;

        if (!cronExpression) continue;

        try {
            const interval = cronParser.parseExpression(cronExpression);
            const prevDate = interval.prev().toDate();
            const timeSinceLast = now.getTime() - prevDate.getTime();

            // If within the last minute, trigger the workflow
            if (timeSinceLast < 60000) {
                const queue = getSchedulerQueue();
                await queue.add('EXECUTE_SCHEDULED_WORKFLOW', {
                    workflowId: workflow.id,
                    tenantId: workflow.tenantId,
                    entityType: workflow.entityType
                });
                triggered++;
            }
        } catch (error) {
            console.error(`Invalid cron expression for workflow ${workflow.id}:`, error);
        }
    }

    return { triggered };
}

async function executeScheduledWorkflow(
    workflowId: string,
    tenantId: string,
    entityType: string
): Promise<{ executed: number }> {
    let executed = 0;

    // For scheduled workflows, we typically run against all matching entities
    // or a subset based on workflow configuration
    const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId }
    });

    if (!workflow) return { executed: 0 };

    const triggerConfig = JSON.parse(workflow.triggerConfig);

    // Get entities to process
    let entities: { id: string }[] = [];

    if (entityType === 'LEAD') {
        entities = await prisma.lead.findMany({
            where: {
                tenantId,
                isDeleted: false,
                isDone: false,
                ...(triggerConfig.filters || {})
            },
            select: { id: true },
            take: triggerConfig.batchSize || 100
        });
    } else if (entityType === 'CASE') {
        entities = await prisma.case.findMany({
            where: {
                tenantId,
                ...(triggerConfig.filters || {})
            },
            select: { caseId: true }
        }).then(cases => cases.map(c => ({ id: c.caseId })));
    }

    // Trigger workflow for each entity
    for (const entity of entities) {
        const triggerData: TriggerData = {
            changeType: 'UPDATE',
            newData: {},
            triggeredAt: new Date(),
            triggeredBy: 'SCHEDULER'
        };

        await TriggerManager.queueWorkflowExecution(
            workflowId,
            entityType as EntityType.LEAD | EntityType.CASE,
            entity.id,
            tenantId,
            triggerData,
            'SYSTEM'
        );
        executed++;
    }

    return { executed };
}

export async function initializeScheduler(): Promise<void> {
    const queue = getSchedulerQueue();

    // Schedule the main check job to run every minute
    await queue.add('CHECK_SCHEDULED_WORKFLOWS', {}, {
        repeat: { cron: '* * * * *' },
        jobId: 'scheduled-workflow-check'
    });

    console.log('Workflow scheduler initialized');
}

export default { getSchedulerQueue, initializeScheduler };
