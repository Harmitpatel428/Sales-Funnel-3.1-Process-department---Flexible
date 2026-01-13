import { PrismaClient } from '@prisma/client';
import { EmailService } from '../email-service';
import Queue from 'bull';

const prisma = new PrismaClient();
const emailService = new EmailService();

// Create Bull queue for email sync
// Assuming Redis is available on localhost:6379 or configured via env
export const emailSyncQueue = new Queue('email-sync', process.env.REDIS_URL || 'redis://localhost:6379');

// Rate limit configuration per provider
const SYNC_RATE_LIMIT = 10; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const providerRequestCounts: Record<string, { count: number; windowStart: number }> = {};

function checkRateLimit(providerId: string): boolean {
    const now = Date.now();
    const usage = providerRequestCounts[providerId] || { count: 0, windowStart: now };

    if (now - usage.windowStart > RATE_LIMIT_WINDOW) {
        // Reset window
        usage.count = 1;
        usage.windowStart = now;
        providerRequestCounts[providerId] = usage;
        return true;
    }

    if (usage.count >= SYNC_RATE_LIMIT) {
        return false;
    }

    usage.count++;
    providerRequestCounts[providerId] = usage;
    return true;
}

export async function processEmailSyncJobs() {
    console.log('Starting scheduled email sync job...');
    const activeProviders = await prisma.emailProvider.findMany({
        where: { isActive: true }
    });

    for (const provider of activeProviders) {
        // Add job to queue instead of running immediately
        // Dedup key to prevent overlapping jobs? Bull handles id uniqueness.
        await emailSyncQueue.add('sync-provider', { providerId: provider.id }, {
            jobId: `sync-${provider.id}-${Date.now()}`, // simple unique id per run
            removeOnComplete: true,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
        });
    }
    console.log(`Queued sync for ${activeProviders.length} providers.`);
}

// Worker processor
emailSyncQueue.process('sync-provider', async (job) => {
    const { providerId } = job.data;

    if (!checkRateLimit(providerId)) {
        console.warn(`Rate limit exceeded for provider ${providerId}, skipping this run.`);
        return; // Skip or throw error to retry later? Skipping is safer for cron syncs.
    }

    console.log(`Processing sync for provider ${providerId}...`);
    try {
        const result = await emailService.syncProvider(providerId);
        console.log(`Synced provider ${providerId}:`, result);
        return result;
    } catch (error: any) {
        console.error(`Error syncing provider ${providerId}:`, error);
        throw error; // Let Bull handle retries
    }
});

// Function to initialize repeated cron (should be called at app startup)
export async function initEmailSyncCron() {
    // Remove old repeatable jobs to avoid duplicates on restart
    const jobs = await emailSyncQueue.getRepeatableJobs();
    for (const job of jobs) {
        await emailSyncQueue.removeRepeatableByKey(job.key);
    }

    // Add new repeatable job running every 5 minutes
    await emailSyncQueue.add({}, {
        repeat: { cron: '*/5 * * * *' }
    });
    console.log('Email sync cron initialized.');
}
