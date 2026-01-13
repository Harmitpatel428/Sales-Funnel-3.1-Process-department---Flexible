/**
 * Workflow Trigger System
 * Detects triggers and initiates workflow executions
 */

import { PrismaClient, Workflow, Lead, Case } from '@prisma/client';

const prisma = new PrismaClient();

// Trigger types enum
export enum TriggerType {
    ON_CREATE = 'ON_CREATE',
    ON_UPDATE = 'ON_UPDATE',
    ON_STATUS_CHANGE = 'ON_STATUS_CHANGE',
    SCHEDULED = 'SCHEDULED',
    MANUAL = 'MANUAL'
}

// Entity types
export enum EntityType {
    LEAD = 'LEAD',
    CASE = 'CASE'
}

// Change types for trigger detection
export type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE';

// Trigger configuration interfaces
export interface TriggerConfig {
    // For ON_UPDATE: specific fields to watch
    watchFields?: string[];
    // For ON_STATUS_CHANGE: from/to status filters
    fromStatus?: string[];
    toStatus?: string[];
    // For SCHEDULED: cron expression
    cronExpression?: string;
    // Additional filters
    conditions?: Array<{
        field: string;
        operator: string;
        value: unknown;
    }>;
}

// Trigger data passed to workflow execution
export interface TriggerData {
    changeType: ChangeType;
    changedFields?: string[];
    oldData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
    triggeredAt: Date;
    triggeredBy?: string;
}

/**
 * TriggerManager - Detects and manages workflow triggers
 */
export class TriggerManager {
    /**
     * Detects which workflows should be triggered based on entity changes
     */
    static async detectTriggers(
        entityType: EntityType,
        entityId: string,
        changeType: ChangeType,
        oldData: Record<string, unknown> | null,
        newData: Record<string, unknown>,
        tenantId: string
    ): Promise<Workflow[]> {
        // Get all active workflows for this entity type and tenant
        const workflows = await prisma.workflow.findMany({
            where: {
                tenantId,
                entityType,
                isActive: true
            },
            include: {
                steps: {
                    orderBy: { stepOrder: 'asc' }
                }
            }
        });

        const matchingWorkflows: Workflow[] = [];

        for (const workflow of workflows) {
            const triggerConfig = JSON.parse(workflow.triggerConfig) as TriggerConfig;

            if (this.evaluateTriggerConditions(workflow, triggerConfig, changeType, oldData, newData)) {
                matchingWorkflows.push(workflow);
            }
        }

        // Sort by priority (higher priority first)
        return matchingWorkflows.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Evaluates if a workflow's trigger conditions are met
     */
    static evaluateTriggerConditions(
        workflow: Workflow,
        triggerConfig: TriggerConfig,
        changeType: ChangeType,
        oldData: Record<string, unknown> | null,
        newData: Record<string, unknown>
    ): boolean {
        switch (workflow.triggerType) {
            case TriggerType.ON_CREATE:
                return changeType === 'CREATE';

            case TriggerType.ON_UPDATE:
                if (changeType !== 'UPDATE') return false;

                // If watchFields specified, check if any of them changed
                if (triggerConfig.watchFields && triggerConfig.watchFields.length > 0) {
                    const changedFields = this.getChangedFields(oldData, newData);
                    const watchedChanged = triggerConfig.watchFields.some(field =>
                        changedFields.includes(field)
                    );
                    if (!watchedChanged) return false;
                }
                return true;

            case TriggerType.ON_STATUS_CHANGE:
                if (changeType !== 'UPDATE') return false;

                const oldStatus = oldData?.status as string | undefined;
                const newStatus = newData?.status as string | undefined;

                if (oldStatus === newStatus) return false;

                // Check from/to status filters
                if (triggerConfig.fromStatus && triggerConfig.fromStatus.length > 0) {
                    if (!oldStatus || !triggerConfig.fromStatus.includes(oldStatus)) {
                        return false;
                    }
                }

                if (triggerConfig.toStatus && triggerConfig.toStatus.length > 0) {
                    if (!newStatus || !triggerConfig.toStatus.includes(newStatus)) {
                        return false;
                    }
                }
                return true;

            case TriggerType.SCHEDULED:
                // Scheduled triggers are handled by the scheduler job
                return false;

            case TriggerType.MANUAL:
                // Manual triggers are only initiated by user action
                return false;

            default:
                return false;
        }
    }

    /**
     * Gets list of fields that changed between old and new data
     */
    static getChangedFields(
        oldData: Record<string, unknown> | null,
        newData: Record<string, unknown>
    ): string[] {
        if (!oldData) return Object.keys(newData);

        const changedFields: string[] = [];
        const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

        for (const key of allKeys) {
            if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
                changedFields.push(key);
            }
        }

        return changedFields;
    }

    /**
     * Queues a workflow for execution via Bull queue
     */
    static async queueWorkflowExecution(
        workflowId: string,
        entityType: EntityType,
        entityId: string,
        tenantId: string,
        triggerData: TriggerData,
        triggeredBy?: string
    ): Promise<string> {
        // Create execution record
        const execution = await prisma.workflowExecution.create({
            data: {
                workflowId,
                tenantId,
                entityType,
                entityId,
                status: 'PENDING',
                triggeredBy: triggeredBy || 'SYSTEM',
                triggerData: JSON.stringify(triggerData),
                executionLog: '[]'
            }
        });

        // Queue the job (will be processed by workflow-executor job)
        const { getWorkflowQueue } = await import('../jobs/workflow-executor');
        const queue = getWorkflowQueue();

        await queue.add('START_WORKFLOW', {
            executionId: execution.id,
            workflowId,
            entityType,
            entityId,
            tenantId
        }, {
            priority: 0, // Will be set based on workflow priority
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            }
        });

        return execution.id;
    }

    /**
     * Triggers workflows after an entity change
     * This is the main entry point called from API routes
     */
    static async triggerWorkflows(
        entityType: EntityType,
        entityId: string,
        changeType: ChangeType,
        oldData: Record<string, unknown> | null,
        newData: Record<string, unknown>,
        tenantId: string,
        triggeredBy?: string
    ): Promise<string[]> {
        const matchingWorkflows = await this.detectTriggers(
            entityType,
            entityId,
            changeType,
            oldData,
            newData,
            tenantId
        );

        const triggerData: TriggerData = {
            changeType,
            changedFields: oldData ? this.getChangedFields(oldData, newData) : undefined,
            oldData: oldData || undefined,
            newData,
            triggeredAt: new Date(),
            triggeredBy
        };

        const executionIds: string[] = [];

        for (const workflow of matchingWorkflows) {
            try {
                const executionId = await this.queueWorkflowExecution(
                    workflow.id,
                    entityType,
                    entityId,
                    tenantId,
                    triggerData,
                    triggeredBy
                );
                executionIds.push(executionId);
            } catch (error) {
                console.error(`Failed to queue workflow ${workflow.id}:`, error);
            }
        }

        return executionIds;
    }

    /**
     * Manually trigger a workflow
     */
    static async manualTrigger(
        workflowId: string,
        entityType: EntityType,
        entityId: string,
        tenantId: string,
        triggeredBy: string,
        customData?: Record<string, unknown>
    ): Promise<string> {
        const workflow = await prisma.workflow.findFirst({
            where: {
                id: workflowId,
                tenantId,
                isActive: true,
                triggerType: TriggerType.MANUAL
            }
        });

        if (!workflow) {
            throw new Error('Workflow not found or not active');
        }

        // Get entity data
        let entityData: Record<string, unknown> = {};
        if (entityType === EntityType.LEAD) {
            const lead = await prisma.lead.findUnique({ where: { id: entityId } });
            entityData = lead as unknown as Record<string, unknown>;
        } else if (entityType === EntityType.CASE) {
            const caseRecord = await prisma.case.findUnique({ where: { caseId: entityId } });
            entityData = caseRecord as unknown as Record<string, unknown>;
        }

        const triggerData: TriggerData = {
            changeType: 'UPDATE',
            newData: { ...entityData, ...customData },
            triggeredAt: new Date(),
            triggeredBy
        };

        return this.queueWorkflowExecution(
            workflowId,
            entityType,
            entityId,
            tenantId,
            triggerData,
            triggeredBy
        );
    }
}

export default TriggerManager;
