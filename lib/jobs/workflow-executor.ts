/**
 * Workflow Executor Job
 * Bull queue processor for workflow execution
 */

import Queue from 'bull';

let workflowQueue: Queue.Queue | null = null;

export function getWorkflowQueue(): Queue.Queue {
    if (!workflowQueue) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        workflowQueue = new Queue('workflow-execution', redisUrl, {
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 100,
                removeOnFail: 50
            }
        });

        // Process START_WORKFLOW jobs
        workflowQueue.process('START_WORKFLOW', 5, async (job) => {
            const { WorkflowExecutor } = await import('../workflows/executor');
            const { executionId } = job.data;
            await WorkflowExecutor.startExecution(executionId);
            return { success: true, executionId };
        });

        // Process RESUME_WORKFLOW jobs
        workflowQueue.process('RESUME_WORKFLOW', 5, async (job) => {
            const { WorkflowExecutor } = await import('../workflows/executor');
            const { executionId } = job.data;
            await WorkflowExecutor.resumeExecution(executionId);
            return { success: true, executionId };
        });

        // Process CHECK_APPROVAL_EXPIRY jobs
        workflowQueue.process('CHECK_APPROVAL_EXPIRY', 1, async (job) => {
            const { ApprovalHandler } = await import('../workflows/approval-handler');
            const { approvalRequestId } = job.data;
            await ApprovalHandler.handleExpiry(approvalRequestId);
            return { success: true, approvalRequestId };
        });

        // Error handling
        workflowQueue.on('error', (error) => {
            console.error('Workflow queue error:', error);
        });

        workflowQueue.on('failed', (job, error) => {
            console.error(`Workflow job ${job.id} failed:`, error);
        });

        workflowQueue.on('completed', (job, result) => {
            console.log(`Workflow job ${job.id} completed:`, result);
        });
    }

    return workflowQueue;
}

export async function initializeWorkflowQueue(): Promise<void> {
    getWorkflowQueue();
    console.log('Workflow execution queue initialized');
}

export async function closeWorkflowQueue(): Promise<void> {
    if (workflowQueue) {
        await workflowQueue.close();
        workflowQueue = null;
    }
}

export default { getWorkflowQueue, initializeWorkflowQueue, closeWorkflowQueue };
