/**
 * Workflow Integration Utilities
 * Helper functions for integrating workflows into Lead/Case API routes
 */

import { TriggerManager, EntityType, ChangeType } from './triggers';
import { SLATrackerService } from './sla-tracker';
import { queueScoreCalculation } from '../jobs/lead-scoring';

/**
 * Trigger workflows after a lead is created
 */
export async function onLeadCreated(
    leadId: string,
    leadData: Record<string, unknown>,
    tenantId: string,
    userId?: string
): Promise<void> {
    try {
        // Trigger ON_CREATE workflows
        await TriggerManager.triggerWorkflows(
            EntityType.LEAD,
            leadId,
            ChangeType.CREATE,
            null,
            leadData,
            tenantId,
            userId
        );

        // Start SLA tracking if applicable
        if (leadData.status) {
            await SLATrackerService.checkForNewTracking(
                'LEAD',
                leadId,
                tenantId,
                leadData.status as string
            );
        }

        // Queue lead score calculation
        await queueScoreCalculation(leadId, tenantId);
    } catch (error) {
        console.error('Failed to process lead creation workflows:', error);
    }
}

/**
 * Trigger workflows after a lead is updated
 */
export async function onLeadUpdated(
    leadId: string,
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    tenantId: string,
    userId?: string
): Promise<void> {
    try {
        // Determine change type
        const statusChanged = oldData.status !== newData.status;
        const changeType = statusChanged ? ChangeType.STATUS_CHANGE : ChangeType.UPDATE;

        // Trigger workflows
        await TriggerManager.triggerWorkflows(
            EntityType.LEAD,
            leadId,
            changeType,
            oldData,
            newData,
            tenantId,
            userId
        );

        // Check for SLA tracking on status change
        if (statusChanged && newData.status) {
            await SLATrackerService.checkForNewTracking(
                'LEAD',
                leadId,
                tenantId,
                newData.status as string
            );
        }

        // Check if lead is completed to stop SLA tracking
        if (newData.isDone || newData.status === 'WON' || newData.status === 'LOST') {
            await SLATrackerService.completeTracking('LEAD', leadId, tenantId);
        }

        // Recalculate lead score
        await queueScoreCalculation(leadId, tenantId);
    } catch (error) {
        console.error('Failed to process lead update workflows:', error);
    }
}

/**
 * Trigger workflows after a case is created
 */
export async function onCaseCreated(
    caseId: string,
    caseData: Record<string, unknown>,
    tenantId: string,
    userId?: string
): Promise<void> {
    try {
        await TriggerManager.triggerWorkflows(
            EntityType.CASE,
            caseId,
            ChangeType.CREATE,
            null,
            caseData,
            tenantId,
            userId
        );

        if (caseData.processStatus) {
            await SLATrackerService.checkForNewTracking(
                'CASE',
                caseId,
                tenantId,
                caseData.processStatus as string
            );
        }
    } catch (error) {
        console.error('Failed to process case creation workflows:', error);
    }
}

/**
 * Trigger workflows after a case is updated
 */
export async function onCaseUpdated(
    caseId: string,
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    tenantId: string,
    userId?: string
): Promise<void> {
    try {
        const statusChanged = oldData.processStatus !== newData.processStatus;
        const changeType = statusChanged ? ChangeType.STATUS_CHANGE : ChangeType.UPDATE;

        await TriggerManager.triggerWorkflows(
            EntityType.CASE,
            caseId,
            changeType,
            oldData,
            newData,
            tenantId,
            userId
        );

        if (statusChanged && newData.processStatus) {
            await SLATrackerService.checkForNewTracking(
                'CASE',
                caseId,
                tenantId,
                newData.processStatus as string
            );
        }

        // Check for case completion
        if (newData.processStatus === 'COMPLETED' || newData.processStatus === 'CANCELLED') {
            await SLATrackerService.completeTracking('CASE', caseId, tenantId);
        }
    } catch (error) {
        console.error('Failed to process case update workflows:', error);
    }
}

/**
 * Manually trigger a workflow for an entity
 */
export async function triggerManualWorkflow(
    workflowId: string,
    entityType: 'LEAD' | 'CASE',
    entityId: string,
    tenantId: string,
    userId: string
): Promise<string> {
    const triggerData = {
        changeType: 'UPDATE' as const,
        newData: {},
        triggeredAt: new Date(),
        triggeredBy: userId
    };

    return TriggerManager.queueWorkflowExecution(
        workflowId,
        entityType === 'LEAD' ? EntityType.LEAD : EntityType.CASE,
        entityId,
        tenantId,
        triggerData,
        userId
    );
}

export default {
    onLeadCreated,
    onLeadUpdated,
    onCaseCreated,
    onCaseUpdated,
    triggerManualWorkflow
};
