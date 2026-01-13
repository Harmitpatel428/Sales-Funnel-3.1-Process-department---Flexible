/**
 * Redis-backed API Rate Limiter
 * Keyed by API key ID with analytics tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './db';

// Redis client interface (use ioredis in production)
interface RedisClient {
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
}

// In-memory fallback for development (mimics Redis)
class InMemoryRedis implements RedisClient {
    private store = new Map<string, { value: number; expiresAt: number }>();

    async incr(key: string): Promise<number> {
        const now = Date.now();
        const existing = this.store.get(key);

        if (existing && existing.expiresAt > now) {
            existing.value += 1;
            return existing.value;
        }

        this.store.set(key, { value: 1, expiresAt: now + 3600000 });
        return 1;
    }

    async expire(key: string, seconds: number): Promise<number> {
        const existing = this.store.get(key);
        if (existing) {
            existing.expiresAt = Date.now() + seconds * 1000;
            return 1;
        }
        return 0;
    }

    async ttl(key: string): Promise<number> {
        const existing = this.store.get(key);
        if (existing) {
            return Math.max(0, Math.floor((existing.expiresAt - Date.now()) / 1000));
        }
        return -1;
    }

    async get(key: string): Promise<string | null> {
        const existing = this.store.get(key);
        if (existing && existing.expiresAt > Date.now()) {
            return String(existing.value);
        }
        return null;
    }

    async set(key: string, value: string, mode?: string, duration?: number): Promise<string | null> {
        const expiresAt = duration ? Date.now() + duration * 1000 : Date.now() + 3600000;
        this.store.set(key, { value: parseInt(value) || 0, expiresAt });
        return 'OK';
    }
}

// Redis client singleton
let redisClient: RedisClient | null = null;

async function getRedisClient(): Promise<RedisClient> {
    if (redisClient) return redisClient;

    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
        try {
            // Dynamic import for ioredis
            const Redis = (await import('ioredis')).default;
            redisClient = new Redis(redisUrl);
            console.log('[RateLimiter] Connected to Redis');
        } catch (error) {
            console.warn('[RateLimiter] Redis connection failed, using in-memory fallback');
            redisClient = new InMemoryRedis();
        }
    } else {
        console.log('[RateLimiter] No REDIS_URL, using in-memory fallback');
        redisClient = new InMemoryRedis();
    }

    return redisClient;
}

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    reset: number; // Unix timestamp
    retryAfter?: number;
}

/**
 * Check rate limit for an API key
 */
export async function checkApiKeyRateLimit(
    apiKeyId: string,
    rateLimit: number,
    windowSeconds: number = 3600
): Promise<RateLimitResult> {
    const redis = await getRedisClient();
    const key = `ratelimit:apikey:${apiKeyId}`;

    // Increment counter
    const count = await redis.incr(key);

    // Set expiry on first request
    if (count === 1) {
        await redis.expire(key, windowSeconds);
    }

    // Get TTL for reset time
    const ttl = await redis.ttl(key);
    const reset = Math.floor(Date.now() / 1000) + ttl;

    const remaining = Math.max(0, rateLimit - count);
    const allowed = count <= rateLimit;

    return {
        allowed,
        limit: rateLimit,
        remaining,
        reset,
        retryAfter: allowed ? undefined : ttl,
    };
}

/**
 * Check rate limit by IP (fallback for unauthenticated requests)
 */
export async function checkIpRateLimit(
    ip: string,
    limit: number = 100,
    windowSeconds: number = 60
): Promise<RateLimitResult> {
    const redis = await getRedisClient();
    const key = `ratelimit:ip:${ip}`;

    const count = await redis.incr(key);

    if (count === 1) {
        await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const reset = Math.floor(Date.now() / 1000) + ttl;

    const remaining = Math.max(0, limit - count);
    const allowed = count <= limit;

    return {
        allowed,
        limit,
        remaining,
        reset,
        retryAfter: allowed ? undefined : ttl,
    };
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
    response: NextResponse,
    result: RateLimitResult
): NextResponse {
    response.headers.set('X-RateLimit-Limit', result.limit.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.reset.toString());

    if (result.retryAfter) {
        response.headers.set('Retry-After', result.retryAfter.toString());
    }

    return response;
}

/**
 * Create rate limit exceeded response
 */
export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
    const response = NextResponse.json(
        {
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests. Please slow down.',
                retryAfter: result.retryAfter,
            },
        },
        { status: 429 }
    );

    return addRateLimitHeaders(response, result);
}

/**
 * Rate limit middleware for API routes
 */
export async function apiRateLimitMiddleware(
    req: NextRequest,
    apiKeyId?: string,
    customLimit?: number
): Promise<NextResponse | null> {
    let result: RateLimitResult;

    if (apiKeyId) {
        // API key based rate limiting
        const apiKey = await prisma.apiKey.findUnique({
            where: { id: apiKeyId },
            select: { rateLimit: true },
        });

        const limit = customLimit || apiKey?.rateLimit || 1000;
        result = await checkApiKeyRateLimit(apiKeyId, limit);
    } else {
        // IP based rate limiting (fallback)
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
            req.headers.get('x-real-ip') ||
            'anonymous';
        result = await checkIpRateLimit(ip);
    }

    if (!result.allowed) {
        return rateLimitExceededResponse(result);
    }

    return null;
}

// ============ Analytics Functions ============

/**
 * Get rate limit usage analytics for an API key
 */
export async function getApiKeyUsageAnalytics(
    apiKeyId: string,
    days: number = 30
): Promise<{
    totalRequests: number;
    requestsByDay: { date: string; count: number }[];
    requestsByEndpoint: { endpoint: string; method: string; count: number }[];
    averageResponseTime: number;
    errorRate: number;
}> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all usage logs for this API key
    const logs = await prisma.apiUsageLog.findMany({
        where: {
            apiKeyId,
            timestamp: { gte: startDate },
        },
        select: {
            endpoint: true,
            method: true,
            statusCode: true,
            responseTime: true,
            timestamp: true,
        },
    });

    // Group by day
    const byDay = logs.reduce((acc, log) => {
        const date = log.timestamp.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Group by endpoint
    const byEndpoint = logs.reduce((acc, log) => {
        const key = `${log.method}:${log.endpoint}`;
        if (!acc[key]) {
            acc[key] = { endpoint: log.endpoint, method: log.method, count: 0 };
        }
        acc[key].count++;
        return acc;
    }, {} as Record<string, { endpoint: string; method: string; count: number }>);

    // Calculate stats
    const totalRequests = logs.length;
    const totalResponseTime = logs.reduce((sum, log) => sum + log.responseTime, 0);
    const errorCount = logs.filter(log => log.statusCode >= 400).length;

    return {
        totalRequests,
        requestsByDay: Object.entries(byDay)
            .map(([date, count]) => ({ date, count: count as number }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        requestsByEndpoint: (Object.values(byEndpoint) as { endpoint: string; method: string; count: number }[])
            .sort((a, b) => b.count - a.count)
            .slice(0, 20),
        averageResponseTime: totalRequests > 0 ? Math.round(totalResponseTime / totalRequests) : 0,
        errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
    };
}

/**
 * Get current rate limit status for an API key
 */
export async function getRateLimitStatus(apiKeyId: string): Promise<{
    currentUsage: number;
    limit: number;
    remaining: number;
    resetsAt: Date;
    percentUsed: number;
}> {
    const redis = await getRedisClient();
    const key = `ratelimit:apikey:${apiKeyId}`;

    const [currentStr, ttl] = await Promise.all([
        redis.get(key),
        redis.ttl(key),
    ]);

    const current = parseInt(currentStr || '0');

    // Get the API key's rate limit
    const apiKey = await prisma.apiKey.findUnique({
        where: { id: apiKeyId },
        select: { rateLimit: true },
    });

    const limit = apiKey?.rateLimit || 1000;
    const remaining = Math.max(0, limit - current);
    const resetTime = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date(Date.now() + 3600000);

    return {
        currentUsage: current,
        limit,
        remaining,
        resetsAt: resetTime,
        percentUsed: (current / limit) * 100,
    };
}

/**
 * Get hourly request distribution
 */
export async function getHourlyDistribution(
    apiKeyId: string,
    date: Date = new Date()
): Promise<{ hour: number; count: number }[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const logs = await prisma.apiUsageLog.findMany({
        where: {
            apiKeyId,
            timestamp: {
                gte: startOfDay,
                lte: endOfDay,
            },
        },
        select: { timestamp: true },
    });

    // Count by hour
    const byHour = new Array(24).fill(0);
    logs.forEach(log => {
        byHour[log.timestamp.getHours()]++;
    });

    return byHour.map((count, hour) => ({ hour, count }));
}
