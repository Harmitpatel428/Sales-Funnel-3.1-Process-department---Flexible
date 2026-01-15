import { prisma } from '@/lib/db';

export async function cleanupExpiredIdempotencyLogs() {
    try {
        const result = await prisma.idempotencyLog.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date()
                }
            }
        });

        console.log(`Cleaned up ${result.count} expired idempotency logs`);
        return result.count;
    } catch (error) {
        console.error('Idempotency cleanup failed:', error);
        throw error;
    }
}

// Run daily
export function scheduleIdempotencyCleanup() {
    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    setInterval(async () => {
        try {
            await cleanupExpiredIdempotencyLogs();
        } catch (error) {
            console.error('Scheduled idempotency cleanup failed:', error);
        }
    }, CLEANUP_INTERVAL);
}
