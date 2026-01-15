import { prisma } from '@/lib/db';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface WebSocketEvent {
    id: string;                    // UUID
    sequenceNumber: number;
    tenantId: string;
    eventType: string;
    payload: any;
    userId?: string;
    timestamp: string;
}

// In-memory buffer per tenant (last 1000 events)
const eventBuffers = new Map<string, WebSocketEvent[]>();
const sequenceCounters = new Map<string, number>();

/**
 * Store event in database and Redis buffer
 */
export async function storeEvent(event: WebSocketEvent): Promise<void> {
    try {
        // Store in database
        await prisma.webSocketEventLog.create({
            data: {
                eventId: event.id,
                tenantId: event.tenantId,
                sequenceNumber: event.sequenceNumber,
                eventType: event.eventType,
                payload: JSON.stringify(event.payload),
                userId: event.userId,
                timestamp: new Date(event.timestamp),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
        });

        // Store in Redis for faster retrieval
        const key = `ws:events:${event.tenantId}`;
        await redis.lpush(key, JSON.stringify(event));
        await redis.ltrim(key, 0, 999); // Keep last 1000
        await redis.expire(key, 86400); // 24 hours TTL
    } catch (error) {
        console.error('Failed to store WebSocket event:', error);
        // Don't throw - event loss is acceptable, real-time sync will handle it
    }
}

/**
 * Get events since a specific sequence number
 */
export async function getEventsSince(
    tenantId: string,
    sinceSequenceNumber: number,
    limit: number = 100
): Promise<WebSocketEvent[]> {
    try {
        // Try Redis first (faster)
        const key = `ws:events:${tenantId}`;
        const cachedEvents = await redis.lrange(key, 0, -1);

        if (cachedEvents.length > 0) {
            const events = cachedEvents
                .map(e => JSON.parse(e) as WebSocketEvent)
                .filter(e => e.sequenceNumber > sinceSequenceNumber)
                .slice(0, limit);

            if (events.length > 0) return events;
        }

        // Fallback to database
        const dbEvents = await prisma.webSocketEventLog.findMany({
            where: {
                tenantId,
                sequenceNumber: { gt: sinceSequenceNumber },
            },
            orderBy: { sequenceNumber: 'asc' },
            take: limit,
        });

        return dbEvents.map(e => ({
            id: e.eventId,
            sequenceNumber: e.sequenceNumber,
            tenantId: e.tenantId,
            eventType: e.eventType,
            payload: JSON.parse(e.payload),
            userId: e.userId || undefined,
            timestamp: e.timestamp.toISOString(),
        }));
    } catch (error) {
        console.error('Failed to retrieve WebSocket events:', error);
        return [];
    }
}

/**
 * Get next sequence number for tenant
 */
export async function getNextSequenceNumber(tenantId: string): Promise<number> {
    if (!sequenceCounters.has(tenantId)) {
        // Initialize from database
        const lastEvent = await prisma.webSocketEventLog.findFirst({
            where: { tenantId },
            orderBy: { sequenceNumber: 'desc' },
            select: { sequenceNumber: true },
        });
        sequenceCounters.set(tenantId, (lastEvent?.sequenceNumber || 0) + 1);
    }

    const current = sequenceCounters.get(tenantId)!;
    sequenceCounters.set(tenantId, current + 1);
    return current;
}

/**
 * Cleanup old events (run as background job)
 */
export async function cleanupOldEvents(): Promise<number> {
    try {
        const result = await prisma.webSocketEventLog.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });
        return result.count;
    } catch (error) {
        console.error('Failed to cleanup WebSocket events:', error);
        return 0;
    }
}
