import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
    uniqueTokenPerInterval?: number;
    interval?: number;
}

export default function rateLimit(options?: RateLimitConfig) {
    const tokenCache = new Map();
    let lastClearTime = Date.now();

    return {
        check: (limit: number, token: string) =>
            new Promise<void>((resolve, reject) => {
                const now = Date.now();
                const interval = options?.interval || 60000;

                // Clear cache if interval passed
                if (now - lastClearTime > interval) {
                    tokenCache.clear();
                    lastClearTime = now;
                }

                const tokenCount = tokenCache.get(token) || [0];
                if (tokenCount[0] === 0) {
                    tokenCache.set(token, tokenCount);
                }
                tokenCount[0] += 1;

                const currentUsage = tokenCount[0];
                const isRateLimited = currentUsage > limit;

                const remaining = isRateLimited ? 0 : limit - currentUsage;
                const reset = new Date(now + interval).toISOString();

                if (isRateLimited) {
                    reject({ remaining, reset });
                } else {
                    resolve();
                }
            }),
    };
}

const limiter = rateLimit({
    interval: 60 * 1000, // 60 seconds
    uniqueTokenPerInterval: 500, // Max 500 users per second
});

import { rateLimitResponse } from '@/lib/api/response-helpers';

export async function rateLimitMiddleware(req: NextRequest, limit: number = 100) {
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    const endpoint = req.nextUrl.pathname;
    const token = `${ip}-${endpoint}`;

    try {
        await limiter.check(limit, token);
        return null; // No error
    } catch (error: any) {
        return rateLimitResponse(
            error.remaining || 0,
            error.reset || new Date().toISOString()
        );
    }
}
