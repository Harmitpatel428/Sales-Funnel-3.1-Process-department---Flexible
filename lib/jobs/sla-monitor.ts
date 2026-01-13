/**
 * SLA Monitor Job
 * Monitors SLA compliance and triggers escalations
 */

import Queue from 'bull';
import { PrismaClient } from '@prisma/client';
import { SLATrackerService, SLAStatus } from '../workflows/sla-tracker';

const prisma = new PrismaClient();
let slaMonitorQueue: Queue.Queue | null = null;

export function getSLAMonitorQueue(): Queue.Queue {
    if (!slaMonitorQueue) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        slaMonitorQueue = new Queue('sla-monitor', redisUrl, {
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 100,
                removeOnFail: 50
            }
        });

        // Process CHECK_ALL_SLAS jobs
        slaMonitorQueue.process('CHECK_ALL_SLAS', 1, async (job) => {
            const { tenantId } = job.data;
            const result = await checkTenantSLAs(tenantId);
            return result;
        });

        // Process CHECK_SLA jobs
        slaMonitorQueue.process('CHECK_SLA', 5, async (job) => {
            const { trackerId } = job.data;
            const result = await SLATrackerService.checkCompliance(trackerId);

            if (result.status === SLAStatus.BREACHED) {
                await SLATrackerService.sendBreachNotification(trackerId);
                await SLATrackerService.triggerEscalation(trackerId);
            }

            return result;
        });

        slaMonitorQueue.on('error', (error) => {
            console.error('SLA monitor queue error:', error);
        });
    }

    return slaMonitorQueue;
}

async function checkTenantSLAs(tenantId: string): Promise<{ checked: number; breached: number }> {
    const trackers = await prisma.sLATracker.findMany({
        where: {
            tenantId,
            status: { in: [SLAStatus.ON_TRACK, SLAStatus.AT_RISK] }
        }
    });

    let breached = 0;
    for (const tracker of trackers) {
        const result = await SLATrackerService.checkCompliance(tracker.id);

        if (result.status === SLAStatus.BREACHED) {
            breached++;
            await SLATrackerService.sendBreachNotification(tracker.id);
            await SLATrackerService.triggerEscalation(tracker.id);
        }
    }

    return { checked: trackers.length, breached };
}

export async function scheduleSLAMonitoring(): Promise<void> {
    const queue = getSLAMonitorQueue();

    const tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true }
    });

    for (const tenant of tenants) {
        await queue.add('CHECK_ALL_SLAS', { tenantId: tenant.id }, {
            repeat: { cron: '*/5 * * * *' }, // Every 5 minutes
            jobId: `sla-check-${tenant.id}`
        });
    }

    console.log(`Scheduled SLA monitoring for ${tenants.length} tenants`);
}

export default { getSLAMonitorQueue, scheduleSLAMonitoring };
