import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface PresenceState {
    userId: string;
    userName: string;
    entityType: 'lead' | 'case' | 'document';
    entityId: string;
    action: 'viewing' | 'editing' | 'idle';
    timestamp: string;
}

/**
 * Track user presence on an entity
 */
export async function trackPresence(
    tenantId: string,
    userId: string,
    userName: string,
    entityType: string,
    entityId: string,
    action: string
): Promise<void> {
    try {
        const key = `presence:${tenantId}:${entityType}:${entityId}`;
        const presenceData = JSON.stringify({
            userId,
            userName,
            action,
            timestamp: new Date().toISOString(),
        });

        await redis.hset(key, userId, presenceData);
        await redis.expire(key, 300); // 5 minutes TTL
    } catch (error) {
        console.error('Failed to track presence:', error);
    }
}

/**
 * Get active users on an entity
 */
export async function getPresence(
    tenantId: string,
    entityType: string,
    entityId: string
): Promise<PresenceState[]> {
    try {
        const key = `presence:${tenantId}:${entityType}:${entityId}`;
        const data = await redis.hgetall(key);

        return Object.entries(data).map(([userId, presenceStr]) => {
            const presence = JSON.parse(presenceStr);
            return {
                userId,
                userName: presence.userName || userId,
                entityType: entityType as any,
                entityId,
                action: presence.action || 'viewing',
                timestamp: presence.timestamp,
            };
        });
    } catch (error) {
        console.error('Failed to get presence:', error);
        return [];
    }
}

/**
 * Remove user presence
 */
export async function removePresence(
    tenantId: string,
    userId: string,
    entityType?: string,
    entityId?: string
): Promise<void> {
    try {
        if (entityType && entityId) {
            const key = `presence:${tenantId}:${entityType}:${entityId}`;
            await redis.hdel(key, userId);
        } else {
            // Remove all presence for user across all entities
            // NOTE: Scanning with keys is slow in production Redis, but acceptable for this scale/TTL
            const pattern = `presence:${tenantId}:*`;
            const keys = await redis.keys(pattern);
            for (const key of keys) {
                await redis.hdel(key, userId);
            }
        }
    } catch (error) {
        console.error('Failed to remove presence:', error);
    }
}
