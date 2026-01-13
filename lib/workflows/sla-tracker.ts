/**
 * SLA Tracking System
 * Monitors SLA compliance and triggers escalations
 */

import { PrismaClient, SLAPolicy, SLATracker } from '@prisma/client';

const prisma = new PrismaClient();

// SLA status types
export enum SLAStatus {
    ON_TRACK = 'ON_TRACK',
    AT_RISK = 'AT_RISK',
    BREACHED = 'BREACHED',
    COMPLETED = 'COMPLETED'
}

// SLA compliance result
export interface SLAComplianceResult {
    trackerId: string;
    status: SLAStatus;
    timeRemaining: number; // in minutes
    percentageRemaining: number;
    dueAt: Date;
}

/**
 * SLATrackerService - Tracks SLA compliance
 */
export class SLATrackerService {
    /**
     * Start tracking SLA for an entity
     */
    static async startTracking(
        slaId: string,
        entityType: string,
        entityId: string,
        tenantId: string
    ): Promise<SLATracker> {
        // Get SLA policy
        const slaPolicy = await prisma.sLAPolicy.findUnique({
            where: { id: slaId }
        });

        if (!slaPolicy || !slaPolicy.isActive) {
            throw new Error('SLA policy not found or inactive');
        }

        // Calculate due date
        const dueAt = new Date(Date.now() + slaPolicy.targetMinutes * 60 * 1000);

        // Check for existing tracker
        const existingTracker = await prisma.sLATracker.findFirst({
            where: {
                slaId,
                entityType,
                entityId,
                status: { in: [SLAStatus.ON_TRACK, SLAStatus.AT_RISK] }
            }
        });

        if (existingTracker) {
            return existingTracker;
        }

        // Create new tracker
        const tracker = await prisma.sLATracker.create({
            data: {
                slaId,
                tenantId,
                entityType,
                entityId,
                dueAt,
                status: SLAStatus.ON_TRACK,
                startedAt: new Date()
            }
        });

        return tracker;
    }

    /**
     * Check compliance for a specific tracker
     */
    static async checkCompliance(trackerId: string): Promise<SLAComplianceResult> {
        const tracker = await prisma.sLATracker.findUnique({
            where: { id: trackerId },
            include: { sla: true }
        });

        if (!tracker) {
            throw new Error('Tracker not found');
        }

        const now = new Date();
        const timeRemaining = (tracker.dueAt.getTime() - now.getTime()) / (1000 * 60);
        const totalTime = tracker.sla.targetMinutes;
        const percentageRemaining = Math.max(0, (timeRemaining / totalTime) * 100);

        // Determine status
        let status = tracker.status as SLAStatus;

        if (tracker.completedAt) {
            status = SLAStatus.COMPLETED;
        } else if (now > tracker.dueAt) {
            status = SLAStatus.BREACHED;
        } else if (percentageRemaining < 20) {
            status = SLAStatus.AT_RISK;
        } else {
            status = SLAStatus.ON_TRACK;
        }

        // Update tracker if status changed
        if (status !== tracker.status) {
            await prisma.sLATracker.update({
                where: { id: trackerId },
                data: { status }
            });
        }

        return {
            trackerId,
            status,
            timeRemaining: Math.max(0, timeRemaining),
            percentageRemaining,
            dueAt: tracker.dueAt
        };
    }

    /**
     * Send breach notification
     */
    static async sendBreachNotification(trackerId: string): Promise<void> {
        const tracker = await prisma.sLATracker.findUnique({
            where: { id: trackerId },
            include: { sla: true }
        });

        if (!tracker || tracker.breachNotificationSent) {
            return;
        }

        // Get entity details
        let entityDetails: Record<string, unknown> = {};
        let assignedUserId: string | null = null;

        if (tracker.entityType === 'LEAD') {
            const lead = await prisma.lead.findUnique({
                where: { id: tracker.entityId },
                include: { assignedTo: true }
            });
            entityDetails = {
                name: lead?.clientName,
                company: lead?.company,
                status: lead?.status
            };
            assignedUserId = lead?.assignedToId || null;
        } else if (tracker.entityType === 'CASE') {
            const caseRecord = await prisma.case.findUnique({
                where: { caseId: tracker.entityId },
                include: { users: true }
            });
            entityDetails = {
                name: caseRecord?.clientName,
                company: caseRecord?.company,
                status: caseRecord?.processStatus
            };
            assignedUserId = caseRecord?.assignedProcessUserId || null;
        }

        // Send notification to assigned user
        if (assignedUserId) {
            const user = await prisma.user.findUnique({ where: { id: assignedUserId } });
            if (user?.email) {
                try {
                    const { sendEmail } = await import('../email-service');
                    await sendEmail({
                        to: user.email,
                        subject: `SLA Breach: ${tracker.sla.name}`,
                        html: `
              <h2>SLA Breach Alert</h2>
              <p>The SLA "${tracker.sla.name}" has been breached.</p>
              <p><strong>Entity:</strong> ${tracker.entityType} - ${entityDetails.name || tracker.entityId}</p>
              <p><strong>Due at:</strong> ${tracker.dueAt.toISOString()}</p>
              <p>Please take immediate action.</p>
            `
                    });
                } catch (error) {
                    console.error('Failed to send SLA breach notification:', error);
                }
            }
        }

        // Log activity
        await prisma.activityLog.create({
            data: {
                tenantId: tracker.tenantId,
                leadId: tracker.entityType === 'LEAD' ? tracker.entityId : undefined,
                caseId: tracker.entityType === 'CASE' ? tracker.entityId : undefined,
                type: 'sla_breach',
                description: `SLA "${tracker.sla.name}" has been breached`,
                metadata: JSON.stringify({
                    trackerId,
                    slaId: tracker.slaId,
                    dueAt: tracker.dueAt
                })
            }
        });

        // Mark notification as sent
        await prisma.sLATracker.update({
            where: { id: trackerId },
            data: { breachNotificationSent: true }
        });
    }

    /**
     * Trigger escalation workflow
     */
    static async triggerEscalation(trackerId: string): Promise<void> {
        const tracker = await prisma.sLATracker.findUnique({
            where: { id: trackerId },
            include: { sla: true }
        });

        if (!tracker || tracker.escalationTriggered) {
            return;
        }

        // Check if SLA has an escalation workflow
        if (tracker.sla.escalationWorkflowId) {
            const { TriggerManager, EntityType, TriggerData } = await import('./triggers');

            const triggerData: TriggerData = {
                changeType: 'UPDATE',
                newData: { slaBreach: true, slaId: tracker.slaId },
                triggeredAt: new Date(),
                triggeredBy: 'SYSTEM'
            };

            await TriggerManager.queueWorkflowExecution(
                tracker.sla.escalationWorkflowId,
                tracker.entityType as 'LEAD' | 'CASE' as unknown as typeof EntityType.LEAD,
                tracker.entityId,
                tracker.tenantId,
                triggerData,
                'SYSTEM'
            );
        }

        // Mark escalation as triggered
        await prisma.sLATracker.update({
            where: { id: trackerId },
            data: { escalationTriggered: true }
        });
    }

    /**
     * Complete SLA tracking when entity reaches completion
     */
    static async completeTracking(
        entityType: string,
        entityId: string,
        tenantId: string
    ): Promise<void> {
        const trackers = await prisma.sLATracker.findMany({
            where: {
                entityType,
                entityId,
                tenantId,
                status: { in: [SLAStatus.ON_TRACK, SLAStatus.AT_RISK] }
            }
        });

        for (const tracker of trackers) {
            await prisma.sLATracker.update({
                where: { id: tracker.id },
                data: {
                    status: SLAStatus.COMPLETED,
                    completedAt: new Date()
                }
            });
        }
    }

    /**
     * Get SLA dashboard data
     */
    static async getDashboardData(tenantId: string): Promise<{
        onTrack: number;
        atRisk: number;
        breached: number;
        completed: number;
        averageCompletionTime: number;
        breachRate: number;
    }> {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Count by status
        const [onTrack, atRisk, breached, completed] = await Promise.all([
            prisma.sLATracker.count({
                where: { tenantId, status: SLAStatus.ON_TRACK }
            }),
            prisma.sLATracker.count({
                where: { tenantId, status: SLAStatus.AT_RISK }
            }),
            prisma.sLATracker.count({
                where: { tenantId, status: SLAStatus.BREACHED }
            }),
            prisma.sLATracker.count({
                where: { tenantId, status: SLAStatus.COMPLETED }
            })
        ]);

        // Calculate average completion time (for completed trackers in last 30 days)
        const completedTrackers = await prisma.sLATracker.findMany({
            where: {
                tenantId,
                status: SLAStatus.COMPLETED,
                completedAt: { gte: thirtyDaysAgo }
            }
        });

        let averageCompletionTime = 0;
        if (completedTrackers.length > 0) {
            const totalTime = completedTrackers.reduce((sum, t) => {
                if (t.completedAt) {
                    return sum + (t.completedAt.getTime() - t.startedAt.getTime());
                }
                return sum;
            }, 0);
            averageCompletionTime = totalTime / completedTrackers.length / (1000 * 60); // in minutes
        }

        // Calculate breach rate
        const totalCompleted = completed + breached;
        const breachRate = totalCompleted > 0
            ? (breached / totalCompleted) * 100
            : 0;

        return {
            onTrack,
            atRisk,
            breached,
            completed,
            averageCompletionTime,
            breachRate
        };
    }

    /**
     * Check for SLA policies that should start tracking
     */
    static async checkForNewTracking(
        entityType: string,
        entityId: string,
        tenantId: string,
        status: string
    ): Promise<void> {
        // Find applicable SLA policies
        const policies = await prisma.sLAPolicy.findMany({
            where: {
                tenantId,
                entityType,
                statusTrigger: status,
                isActive: true
            }
        });

        // Start tracking for each matching policy
        for (const policy of policies) {
            try {
                await this.startTracking(policy.id, entityType, entityId, tenantId);
            } catch (error) {
                console.error(`Failed to start SLA tracking for policy ${policy.id}:`, error);
            }
        }
    }
}

export default SLATrackerService;
