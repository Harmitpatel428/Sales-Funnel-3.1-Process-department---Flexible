import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/analytics/usage - API usage analytics
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const days = parseInt(searchParams.get('days') || '30');
        const apiKeyId = searchParams.get('apiKeyId');

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const where: any = {
            apiKey: { tenantId: session.tenantId },
            timestamp: { gte: startDate },
        };

        if (apiKeyId) {
            where.apiKeyId = apiKeyId;
        }

        // Get usage by endpoint
        const usageByEndpoint = await prisma.apiUsageLog.groupBy({
            by: ['endpoint', 'method'],
            where,
            _count: { id: true },
            _avg: { responseTime: true },
        });

        // Get usage by day
        const allLogs = await prisma.apiUsageLog.findMany({
            where,
            select: {
                timestamp: true,
                statusCode: true,
                responseTime: true,
            },
        });

        // Group by day
        const usageByDay = allLogs.reduce((acc, log) => {
            const day = log.timestamp.toISOString().split('T')[0];
            if (!acc[day]) {
                acc[day] = { date: day, requests: 0, errors: 0, avgResponseTime: 0, totalResponseTime: 0 };
            }
            acc[day].requests++;
            if (log.statusCode >= 400) acc[day].errors++;
            acc[day].totalResponseTime += log.responseTime;
            return acc;
        }, {} as Record<string, any>);

        // Calculate averages
        const dailyStats = Object.values(usageByDay).map((day: any) => ({
            date: day.date,
            requests: day.requests,
            errors: day.errors,
            errorRate: day.requests > 0 ? (day.errors / day.requests * 100).toFixed(2) : 0,
            avgResponseTime: day.requests > 0 ? Math.round(day.totalResponseTime / day.requests) : 0,
        })).sort((a: any, b: any) => a.date.localeCompare(b.date));

        // Get total stats
        const totalRequests = allLogs.length;
        const totalErrors = allLogs.filter(l => l.statusCode >= 400).length;
        const avgResponseTime = totalRequests > 0
            ? Math.round(allLogs.reduce((sum, l) => sum + l.responseTime, 0) / totalRequests)
            : 0;

        // Get status code distribution
        const statusDistribution = allLogs.reduce((acc, log) => {
            const category = `${Math.floor(log.statusCode / 100)}xx`;
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return NextResponse.json({
            success: true,
            data: {
                summary: {
                    totalRequests,
                    totalErrors,
                    errorRate: totalRequests > 0 ? (totalErrors / totalRequests * 100).toFixed(2) : 0,
                    avgResponseTime,
                    period: { startDate: startDate.toISOString(), endDate: new Date().toISOString() },
                },
                byEndpoint: usageByEndpoint.map(item => ({
                    endpoint: item.endpoint,
                    method: item.method,
                    requests: item._count.id,
                    avgResponseTime: Math.round(item._avg.responseTime || 0),
                })).sort((a, b) => b.requests - a.requests),
                byDay: dailyStats,
                statusDistribution,
            },
        });
    } catch (error: any) {
        console.error('Error fetching usage analytics:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch usage analytics' },
            { status: 500 }
        );
    }
}
