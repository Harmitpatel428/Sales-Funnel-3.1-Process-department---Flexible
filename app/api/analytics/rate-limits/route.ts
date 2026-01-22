import { NextRequest, NextResponse } from 'next/server';
import { getRateLimitStatus, getApiKeyUsageAnalytics, getHourlyDistribution } from '@/lib/api-rate-limiter';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/analytics/rate-limits
 * Get rate limit status and analytics for API keys
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const apiKeyId = searchParams.get('apiKeyId');
        const days = parseInt(searchParams.get('days') || '30');

        // If specific API key requested
        if (apiKeyId) {
            // Verify the API key belongs to the tenant
            const apiKey = await prisma.apiKey.findFirst({
                where: { id: apiKeyId, tenantId: session.tenantId },
                select: { id: true, name: true, rateLimit: true, isActive: true },
            });

            if (!apiKey) {
                return notFoundResponse('API key');
            }

            const [rateLimitStatus, usageAnalytics, hourlyDistribution] = await Promise.all([
                getRateLimitStatus(apiKeyId),
                getApiKeyUsageAnalytics(apiKeyId, days),
                getHourlyDistribution(apiKeyId),
            ]);

            return NextResponse.json({
                success: true,
                data: {
                    apiKey: {
                        id: apiKey.id,
                        name: apiKey.name,
                        isActive: apiKey.isActive,
                    },
                    rateLimits: rateLimitStatus,
                    usage: usageAnalytics,
                    hourlyDistribution,
                },
            });
        }

        // Get overview for all API keys
        const apiKeys = await prisma.apiKey.findMany({
            where: { tenantId: session.tenantId },
            select: {
                id: true,
                name: true,
                rateLimit: true,
                isActive: true,
                lastUsedAt: true,
                _count: { select: { usageLogs: true } },
            },
            orderBy: { lastUsedAt: 'desc' },
        });

        // Get rate limit status for each key
        const keysWithStatus = await Promise.all(
            apiKeys.map(async (key) => {
                const status = await getRateLimitStatus(key.id);
                return {
                    id: key.id,
                    name: key.name,
                    isActive: key.isActive,
                    lastUsedAt: key.lastUsedAt,
                    totalRequests: key._count.usageLogs,
                    rateLimit: {
                        limit: status.limit,
                        currentUsage: status.currentUsage,
                        remaining: status.remaining,
                        percentUsed: status.percentUsed,
                        resetsAt: status.resetsAt,
                    },
                };
            })
        );

        // Calculate totals
        const totalRequests = keysWithStatus.reduce((sum, k) => sum + k.totalRequests, 0);
        const activeKeys = keysWithStatus.filter(k => k.isActive).length;
        const keysNearLimit = keysWithStatus.filter(k => k.rateLimit.percentUsed > 80).length;

        return NextResponse.json({
            success: true,
            data: {
                summary: {
                    totalApiKeys: apiKeys.length,
                    activeApiKeys: activeKeys,
                    totalRequests,
                    keysNearLimit,
                },
                apiKeys: keysWithStatus,
            },
        });
    }
);
