/**
 * Escalation Monitor Job
 * Checks for leads/cases meeting escalation criteria
 */

import Queue from 'bull';
import { PrismaClient } from '@prisma/client';
import { TriggerManager, EntityType } from '../workflows/triggers';

const prisma = new PrismaClient();
let escalationQueue: Queue.Queue | null = null;

export function getEscalationQueue(): Queue.Queue {
    if (!escalationQueue) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        escalationQueue = new Queue('escalation-monitor', redisUrl, {
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 100,
                removeOnFail: 50
            }
        });

        escalationQueue.process('CHECK_ESCALATIONS', 1, async (job) => {
            const { tenantId } = job.data;
            return await checkEscalationCriteria(tenantId);
        });

        escalationQueue.on('error', (error) => {
            console.error('Escalation queue error:', error);
        });
    }

    return escalationQueue;
}

async function checkEscalationCriteria(tenantId: string): Promise<{ escalated: number }> {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    let escalated = 0;

    // Check leads with no activity for 3+ days
    const inactiveLeads = await prisma.lead.findMany({
        where: {
            tenantId,
            isDeleted: false,
            isDone: false,
            lastActivityDate: { lt: threeDaysAgo }
        },
        take: 100
    });

    for (const lead of inactiveLeads) {
        await TriggerManager.triggerWorkflows(
            EntityType.LEAD,
            lead.id,
            'UPDATE',
            null,
            { ...lead, escalationReason: 'No activity for 3+ days' } as unknown as Record<string, unknown>,
            tenantId,
            'SYSTEM'
        );
        escalated++;
    }

    // Check overdue follow-ups
    const overdueLeads = await prisma.lead.findMany({
        where: {
            tenantId,
            isDeleted: false,
            isDone: false,
            followUpDate: { lt: now }
        },
        take: 100
    });

    for (const lead of overdueLeads) {
        await TriggerManager.triggerWorkflows(
            EntityType.LEAD,
            lead.id,
            'UPDATE',
            null,
            { ...lead, escalationReason: 'Overdue follow-up' } as unknown as Record<string, unknown>,
            tenantId,
            'SYSTEM'
        );
        escalated++;
    }

    return { escalated };
}

export async function scheduleEscalationMonitoring(): Promise<void> {
    const queue = getEscalationQueue();

    const tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true }
    });

    for (const tenant of tenants) {
        await queue.add('CHECK_ESCALATIONS', { tenantId: tenant.id }, {
            repeat: { cron: '*/15 * * * *' }, // Every 15 minutes
            jobId: `escalation-check-${tenant.id}`
        });
    }

    console.log(`Scheduled escalation monitoring for ${tenants.length} tenants`);
}

export default { getEscalationQueue, scheduleEscalationMonitoring };
