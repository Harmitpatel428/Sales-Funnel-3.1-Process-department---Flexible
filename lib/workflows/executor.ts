/**
 * Workflow Execution Engine
 * Orchestrates workflow execution using Bull queue
 */

import { Workflow, WorkflowStep, WorkflowExecution } from '@prisma/client';
import { ActionExecutor, ActionType, ActionResult } from './actions';
import { ConditionEvaluator, ExecutionContext, ConditionType, ConditionConfig } from './conditions';
import { prisma } from '../db';

// Execution status types
export enum ExecutionStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
    PAUSED = 'PAUSED'
}

// Step result for execution log
export interface StepResult {
    stepId: string;
    stepType: string;
    actionType?: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'PAUSED';
    message: string;
    data?: Record<string, unknown>;
    executedAt: string;
    duration?: number;
}

// Workflow with steps type
type WorkflowWithSteps = Workflow & {
    steps: WorkflowStep[];
};

/**
 * WorkflowExecutor - Orchestrates workflow execution
 */
export class WorkflowExecutor {
    /**
     * Start a workflow execution
     */
    static async startExecution(executionId: string): Promise<void> {
        // Update execution status to RUNNING
        const execution = await prisma.workflowExecution.update({
            where: { id: executionId },
            data: {
                status: ExecutionStatus.RUNNING,
                startedAt: new Date()
            },
            include: {
                workflow: {
                    include: {
                        steps: {
                            orderBy: { stepOrder: 'asc' }
                        }
                    }
                }
            }
        });

        if (!execution.workflow) {
            await this.failExecution(executionId, 'Workflow not found');
            return;
        }

        // Load entity data
        const entityData = await this.loadEntityData(
            execution.entityType,
            execution.entityId
        );

        if (!entityData) {
            await this.failExecution(executionId, 'Entity not found');
            return;
        }

        // Parse trigger data for previous state
        const triggerData = JSON.parse(execution.triggerData);

        // Build execution context
        const context = ConditionEvaluator.buildContext(
            entityData,
            triggerData.oldData,
            undefined, // User will be loaded if needed
            undefined  // Tenant will be loaded if needed
        );

        // Execute workflow steps
        await this.executeSteps(
            execution.id,
            execution.workflow as WorkflowWithSteps,
            context
        );
    }

    /**
     * Execute workflow steps in sequence
     */
    static async executeSteps(
        executionId: string,
        workflow: WorkflowWithSteps,
        context: ExecutionContext
    ): Promise<void> {
        const execution = await prisma.workflowExecution.findUnique({
            where: { id: executionId }
        });

        if (!execution) return;

        const executionLog: StepResult[] = JSON.parse(execution.executionLog);
        const steps = workflow.steps;

        // Find the starting step (either first or current step for resumed executions)
        let startIndex = 0;
        if (execution.currentStepId) {
            startIndex = steps.findIndex(s => s.id === execution.currentStepId);
            if (startIndex === -1) startIndex = 0;
        }

        // Execute steps
        for (let i = startIndex; i < steps.length; i++) {
            const step = steps[i];
            const startTime = Date.now();

            try {
                // Check if this step should be executed (for conditional steps)
                if (step.stepType === 'CONDITION') {
                    const shouldExecute = await this.evaluateCondition(step, context);

                    if (!shouldExecute) {
                        // Skip this step and its children
                        executionLog.push({
                            stepId: step.id,
                            stepType: step.stepType,
                            status: 'SKIPPED',
                            message: 'Condition not met',
                            executedAt: new Date().toISOString(),
                            duration: Date.now() - startTime
                        });

                        // Skip nested steps
                        const childSteps = steps.filter(s => s.parentStepId === step.id);
                        for (const childStep of childSteps) {
                            const childIndex = steps.indexOf(childStep);
                            if (childIndex > i) {
                                // Will be skipped in next iterations
                            }
                        }
                        continue;
                    }
                }

                // Execute action step
                if (step.stepType === 'ACTION' && step.actionType) {
                    const result = await this.executeStep(
                        executionId,
                        step,
                        context
                    );

                    executionLog.push({
                        stepId: step.id,
                        stepType: step.stepType,
                        actionType: step.actionType,
                        status: result.success ? 'SUCCESS' : 'FAILED',
                        message: result.message,
                        data: result.data,
                        executedAt: new Date().toISOString(),
                        duration: Date.now() - startTime
                    });

                    // Check if execution should pause
                    if (result.shouldPause) {
                        await prisma.workflowExecution.update({
                            where: { id: executionId },
                            data: {
                                status: ExecutionStatus.PAUSED,
                                currentStepId: steps[i + 1]?.id, // Resume from next step
                                executionLog: JSON.stringify(executionLog)
                            }
                        });

                        // Schedule resume for WAIT action
                        if (result.resumeAt) {
                            await this.scheduleResume(executionId, result.resumeAt);
                        }

                        return; // Exit execution, will be resumed later
                    }

                    // Check for failure
                    if (!result.success) {
                        await this.failExecution(
                            executionId,
                            result.error || result.message,
                            executionLog
                        );
                        return;
                    }

                    // Update execution log
                    await prisma.workflowExecution.update({
                        where: { id: executionId },
                        data: { executionLog: JSON.stringify(executionLog) }
                    });
                }
            } catch (error) {
                executionLog.push({
                    stepId: step.id,
                    stepType: step.stepType,
                    actionType: step.actionType || undefined,
                    status: 'FAILED',
                    message: (error as Error).message,
                    executedAt: new Date().toISOString(),
                    duration: Date.now() - startTime
                });

                await this.failExecution(
                    executionId,
                    (error as Error).message,
                    executionLog
                );
                return;
            }
        }

        // All steps completed successfully
        await this.completeExecution(executionId, executionLog);
    }

    /**
     * Execute a single workflow step
     */
    static async executeStep(
        executionId: string,
        step: WorkflowStep,
        context: ExecutionContext
    ): Promise<ActionResult> {
        const execution = await prisma.workflowExecution.findUnique({
            where: { id: executionId }
        });

        if (!execution) {
            throw new Error('Execution not found');
        }

        const actionConfig = JSON.parse(step.actionConfig);
        const actionExecutor = new ActionExecutor(
            context,
            execution.tenantId,
            execution.entityType,
            execution.entityId,
            executionId
        );

        return actionExecutor.execute(
            step.actionType as ActionType,
            actionConfig
        );
    }

    /**
     * Evaluate a condition step
     */
    static async evaluateCondition(
        step: WorkflowStep,
        context: ExecutionContext
    ): Promise<boolean> {
        if (!step.conditionType) return true;

        const conditionConfig = JSON.parse(step.conditionConfig) as ConditionConfig;

        switch (step.conditionType) {
            case ConditionType.IF:
            case ConditionType.ELSE_IF:
                return ConditionEvaluator.evaluate(conditionConfig, context);

            case ConditionType.ELSE:
                return true; // ELSE always executes if reached

            case ConditionType.AND:
                return ConditionEvaluator.evaluateGroup(
                    conditionConfig.conditions || [],
                    ConditionType.AND,
                    context
                );

            case ConditionType.OR:
                return ConditionEvaluator.evaluateGroup(
                    conditionConfig.conditions || [],
                    ConditionType.OR,
                    context
                );

            default:
                return true;
        }
    }

    /**
     * Handle successful step execution
     */
    static async handleStepSuccess(
        executionId: string,
        stepId: string,
        result: ActionResult
    ): Promise<void> {
        const execution = await prisma.workflowExecution.findUnique({
            where: { id: executionId }
        });

        if (!execution) return;

        const executionLog: StepResult[] = JSON.parse(execution.executionLog);
        executionLog.push({
            stepId,
            stepType: 'ACTION',
            actionType: result.actionType,
            status: 'SUCCESS',
            message: result.message,
            data: result.data,
            executedAt: new Date().toISOString()
        });

        await prisma.workflowExecution.update({
            where: { id: executionId },
            data: { executionLog: JSON.stringify(executionLog) }
        });
    }

    /**
     * Handle step failure with retry logic
     */
    static async handleStepFailure(
        executionId: string,
        stepId: string,
        error: Error
    ): Promise<void> {
        await this.failExecution(executionId, error.message);
    }

    /**
     * Complete a workflow execution
     */
    static async completeExecution(
        executionId: string,
        executionLog?: StepResult[]
    ): Promise<void> {
        const updateData: Record<string, unknown> = {
            status: ExecutionStatus.COMPLETED,
            completedAt: new Date()
        };

        if (executionLog) {
            updateData.executionLog = JSON.stringify(executionLog);
        }

        await prisma.workflowExecution.update({
            where: { id: executionId },
            data: updateData
        });

        // Create audit log
        const execution = await prisma.workflowExecution.findUnique({
            where: { id: executionId },
            include: { workflow: true }
        });

        if (execution) {
            await prisma.auditLog.create({
                data: {
                    actionType: 'WORKFLOW_COMPLETED',
                    entityType: execution.entityType,
                    entityId: execution.entityId,
                    description: `Workflow "${execution.workflow?.name}" completed successfully`,
                    tenantId: execution.tenantId,
                    metadata: JSON.stringify({
                        workflowId: execution.workflowId,
                        executionId
                    })
                }
            });
        }
    }

    /**
     * Mark execution as failed
     */
    static async failExecution(
        executionId: string,
        errorMessage: string,
        executionLog?: StepResult[]
    ): Promise<void> {
        const updateData: Record<string, unknown> = {
            status: ExecutionStatus.FAILED,
            completedAt: new Date(),
            errorMessage
        };

        if (executionLog) {
            updateData.executionLog = JSON.stringify(executionLog);
        }

        await prisma.workflowExecution.update({
            where: { id: executionId },
            data: updateData
        });

        // Create audit log
        const execution = await prisma.workflowExecution.findUnique({
            where: { id: executionId },
            include: { workflow: true }
        });

        if (execution) {
            await prisma.auditLog.create({
                data: {
                    actionType: 'WORKFLOW_FAILED',
                    entityType: execution.entityType,
                    entityId: execution.entityId,
                    description: `Workflow "${execution.workflow?.name}" failed: ${errorMessage}`,
                    tenantId: execution.tenantId,
                    metadata: JSON.stringify({
                        workflowId: execution.workflowId,
                        executionId,
                        error: errorMessage
                    })
                }
            });

            // Notify workflow creator about failure
            if (execution.workflow?.createdById) {
                try {
                    const creator = await prisma.user.findUnique({
                        where: { id: execution.workflow.createdById }
                    });
                    if (creator?.email) {
                        const { sendEmail } = await import('../email-service');
                        await sendEmail({
                            to: creator.email,
                            subject: `Workflow Failed: ${execution.workflow.name}`,
                            html: `<p>Workflow "${execution.workflow.name}" failed with error: ${errorMessage}</p>
                     <p>Execution ID: ${executionId}</p>`
                        });
                    }
                } catch (e) {
                    console.error('Failed to notify workflow creator:', e);
                }
            }
        }
    }

    /**
     * Resume a paused workflow
     */
    static async resumeExecution(executionId: string): Promise<void> {
        const execution = await prisma.workflowExecution.findUnique({
            where: { id: executionId },
            include: {
                workflow: {
                    include: {
                        steps: {
                            orderBy: { stepOrder: 'asc' }
                        }
                    }
                }
            }
        });

        if (!execution || execution.status !== ExecutionStatus.PAUSED) {
            throw new Error('Execution not found or not paused');
        }

        // Update status back to running
        await prisma.workflowExecution.update({
            where: { id: executionId },
            data: { status: ExecutionStatus.RUNNING }
        });

        // Load entity data
        const entityData = await this.loadEntityData(
            execution.entityType,
            execution.entityId
        );

        if (!entityData) {
            await this.failExecution(executionId, 'Entity not found');
            return;
        }

        // Build context
        const triggerData = JSON.parse(execution.triggerData);
        const context = ConditionEvaluator.buildContext(
            entityData,
            triggerData.oldData
        );

        // Continue execution
        await this.executeSteps(
            executionId,
            execution.workflow as WorkflowWithSteps,
            context
        );
    }

    /**
     * Schedule a workflow resume
     */
    static async scheduleResume(executionId: string, resumeAt: Date): Promise<void> {
        const { getWorkflowQueue } = await import('../jobs/workflow-executor');
        const queue = getWorkflowQueue();

        const delay = resumeAt.getTime() - Date.now();

        await queue.add('RESUME_WORKFLOW', {
            executionId
        }, {
            delay: Math.max(0, delay),
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            }
        });
    }

    /**
     * Cancel a workflow execution
     */
    static async cancelExecution(executionId: string, userId: string): Promise<void> {
        await prisma.workflowExecution.update({
            where: { id: executionId },
            data: {
                status: ExecutionStatus.CANCELLED,
                completedAt: new Date()
            }
        });

        const execution = await prisma.workflowExecution.findUnique({
            where: { id: executionId }
        });

        if (execution) {
            await prisma.auditLog.create({
                data: {
                    actionType: 'WORKFLOW_CANCELLED',
                    entityType: execution.entityType,
                    entityId: execution.entityId,
                    description: `Workflow execution cancelled`,
                    performedById: userId,
                    tenantId: execution.tenantId,
                    metadata: JSON.stringify({
                        workflowId: execution.workflowId,
                        executionId
                    })
                }
            });
        }
    }

    /**
     * Retry a failed workflow execution
     */
    static async retryExecution(executionId: string, userId: string): Promise<string> {
        const execution = await prisma.workflowExecution.findUnique({
            where: { id: executionId }
        });

        if (!execution || execution.status !== ExecutionStatus.FAILED) {
            throw new Error('Execution not found or not failed');
        }

        // Create a new execution
        const newExecution = await prisma.workflowExecution.create({
            data: {
                workflowId: execution.workflowId,
                tenantId: execution.tenantId,
                entityType: execution.entityType,
                entityId: execution.entityId,
                status: ExecutionStatus.PENDING,
                triggeredBy: userId,
                triggerData: execution.triggerData,
                executionLog: '[]'
            }
        });

        // Queue the new execution
        const { getWorkflowQueue } = await import('../jobs/workflow-executor');
        const queue = getWorkflowQueue();

        await queue.add('START_WORKFLOW', {
            executionId: newExecution.id,
            workflowId: execution.workflowId,
            entityType: execution.entityType,
            entityId: execution.entityId,
            tenantId: execution.tenantId
        });

        return newExecution.id;
    }

    /**
     * Load entity data from the database
     */
    private static async loadEntityData(
        entityType: string,
        entityId: string
    ): Promise<Record<string, unknown> | null> {
        if (entityType === 'LEAD') {
            const lead = await prisma.lead.findUnique({
                where: { id: entityId },
                include: {
                    assignedTo: true,
                    createdBy: true
                }
            });
            return lead as unknown as Record<string, unknown>;
        } else if (entityType === 'CASE') {
            const caseRecord = await prisma.case.findUnique({
                where: { caseId: entityId },
                include: {
                    users: true
                }
            });
            return caseRecord as unknown as Record<string, unknown>;
        }
        return null;
    }
}

export default WorkflowExecutor;
