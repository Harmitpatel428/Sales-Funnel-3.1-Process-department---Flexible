import { getRedisClient } from '../redis';

/**
 * Increment the count of messages sent for a tenant
 */
export async function incrementMessageCount(tenantId: string) {
    const redis = await getRedisClient();
    const key = `ws:metrics:${tenantId}:messages`;
    try {
        await redis.incr(key);
        await redis.expire(key, 3600); // 1 hour TTL
    } catch (error) {
        console.error('[WebSocketMetrics] Failed to increment message count:', error);
    }
}

/**
 * Record message latency for a tenant
 */
export async function recordLatency(tenantId: string, latencyMs: number) {
    const redis = await getRedisClient();
    const key = `ws:metrics:${tenantId}:latency`;
    try {
        await redis.lpush(key, latencyMs.toString());
        await redis.ltrim(key, 0, 99); // Keep last 100
        await redis.expire(key, 3600);
    } catch (error) {
        console.error('[WebSocketMetrics] Failed to record latency:', error);
    }
}

/**
 * Record a client reconnection event
 */
export async function recordReconnection(tenantId: string) {
    const redis = await getRedisClient();
    const key = `ws:metrics:${tenantId}:reconnections`;
    try {
        await redis.incr(key);
        await redis.expire(key, 3600);
    } catch (error) {
        console.error('[WebSocketMetrics] Failed to record reconnection:', error);
    }
}

/**
 * Retrieve consolidated metrics for a tenant
 */
export async function getMetrics(tenantId: string) {
    const redis = await getRedisClient();
    try {
        const [messages, reconnections, latencies] = await Promise.all([
            redis.get(`ws:metrics:${tenantId}:messages`),
            redis.get(`ws:metrics:${tenantId}:reconnections`),
            redis.lrange(`ws:metrics:${tenantId}:latency`, 0, -1)
        ]);

        const latList = latencies.map(Number);
        const avgLatency = latList.length > 0 ? latList.reduce((a, b) => a + b, 0) / latList.length : 0;

        return {
            messages: parseInt(messages || '0'),
            reconnections: parseInt(reconnections || '0'),
            averageLatency: Math.round(avgLatency * 100) / 100,
            sampleSize: latList.length
        };
    } catch (error) {
        console.error('[WebSocketMetrics] Failed to get metrics:', error);
        return null;
    }
}
