/**
 * Lead Scoring Job
 * Scheduled job for bulk lead score calculation
 */

import Queue from 'bull';
import { PrismaClient } from '@prisma/client';
import { LeadScoringEngine } from '../workflows/lead-scoring';

const prisma = new PrismaClient();
let leadScoringQueue: Queue.Queue | null = null;

export function getLeadScoringQueue(): Queue.Queue {
    if (!leadScoringQueue) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        leadScoringQueue = new Queue('lead-scoring', redisUrl, {
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: 50,
                removeOnFail: 20
            }
        });

        // Process CALCULATE_SCORE jobs
        leadScoringQueue.process('CALCULATE_SCORE', 10, async (job) => {
            const { leadId, tenantId } = job.data;
            const result = await LeadScoringEngine.calculateScore(leadId, tenantId);
            return { success: true, leadId, score: result.score };
        });

        // Process BULK_CALCULATE jobs
        leadScoringQueue.process('BULK_CALCULATE', 1, async (job) => {
            const { tenantId } = job.data;
            const count = await LeadScoringEngine.bulkCalculateScores(tenantId);
            return { success: true, tenantId, calculated: count };
        });

        leadScoringQueue.on('error', (error) => {
            console.error('Lead scoring queue error:', error);
        });
    }

    return leadScoringQueue;
}

export async function scheduleDailyScoring(): Promise<void> {
    const queue = getLeadScoringQueue();

    // Get all active tenants
    const tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true }
    });

    for (const tenant of tenants) {
        await queue.add('BULK_CALCULATE', { tenantId: tenant.id }, {
            repeat: { cron: '0 2 * * *' }, // Daily at 2 AM
            jobId: `daily-scoring-${tenant.id}`
        });
    }

    console.log(`Scheduled daily lead scoring for ${tenants.length} tenants`);
}

export async function queueScoreCalculation(leadId: string, tenantId: string): Promise<void> {
    const queue = getLeadScoringQueue();
    await queue.add('CALCULATE_SCORE', { leadId, tenantId });
}

export default { getLeadScoringQueue, scheduleDailyScoring, queueScoreCalculation };
