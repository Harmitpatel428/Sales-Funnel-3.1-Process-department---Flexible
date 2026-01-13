/**
 * Workflow System Initialization
 * Initialize all workflow background jobs and queues
 */

import { initializeWorkflowQueue } from './jobs/workflow-executor';
import { scheduleDailyScoring } from './jobs/lead-scoring';
import { scheduleSLAMonitoring } from './jobs/sla-monitor';
import { scheduleEscalationMonitoring } from './jobs/escalation-monitor';
import { initializeScheduler } from './jobs/workflow-scheduler';

/**
 * Initialize the complete workflow automation system
 * Call this during application startup
 */
export async function initializeWorkflowSystem(): Promise<void> {
    console.log('Initializing Workflow Automation System...');

    try {
        // Initialize workflow execution queue
        await initializeWorkflowQueue();
        console.log('✓ Workflow execution queue initialized');

        // Initialize scheduled workflow checker
        await initializeScheduler();
        console.log('✓ Workflow scheduler initialized');

        // Schedule daily lead scoring
        await scheduleDailyScoring();
        console.log('✓ Lead scoring jobs scheduled');

        // Schedule SLA monitoring
        await scheduleSLAMonitoring();
        console.log('✓ SLA monitoring jobs scheduled');

        // Schedule escalation monitoring
        await scheduleEscalationMonitoring();
        console.log('✓ Escalation monitoring jobs scheduled');

        console.log('Workflow Automation System initialized successfully!');
    } catch (error) {
        console.error('Failed to initialize Workflow Automation System:', error);
        throw error;
    }
}

export default { initializeWorkflowSystem };
