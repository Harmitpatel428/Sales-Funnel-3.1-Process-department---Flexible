import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    calculateMovingAverage,
    forecastTimeSeries,
    calculateLinearRegression,
    generateScenarioForecasts,
    calculateTrend,
    type DataPoint
} from '@/lib/analytics/forecasting';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

// In-memory cache for forecast results
const forecastCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * GET /api/reports/forecast
 * Generate forecast data for leads or cases
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const entity = searchParams.get('entity') || 'leads';
        const period = parseInt(searchParams.get('period') || '30');
        const forecastDays = parseInt(searchParams.get('forecastDays') || '30');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Check cache
        const cacheKey = `forecast:${session.tenantId}:${entity}:${period}:${forecastDays}:${startDate}:${endDate}`;
        const cached = forecastCache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
            return NextResponse.json({
                success: true,
                data: cached.data,
                cached: true
            });
        }

        // Build date filter
        const dateFilter: any = {};
        if (startDate) {
            dateFilter.gte = new Date(startDate);
        } else {
            // Default to last 365 days
            const defaultStart = new Date();
            defaultStart.setDate(defaultStart.getDate() - 365);
            dateFilter.gte = defaultStart;
        }
        if (endDate) {
            dateFilter.lte = new Date(endDate);
        }

        // Fetch historical data
        let rawData: any[];

        if (entity === 'leads') {
            rawData = await prisma.lead.findMany({
                where: {
                    tenantId: session.tenantId,
                    isDeleted: false,
                    createdAt: dateFilter
                },
                select: {
                    id: true,
                    createdAt: true,
                    status: true,
                    budget: true
                },
                orderBy: { createdAt: 'asc' }
            });
        } else {
            rawData = await prisma.case.findMany({
                where: {
                    tenantId: session.tenantId,
                    createdAt: dateFilter
                },
                select: {
                    caseId: true,
                    createdAt: true,
                    processStatus: true,
                    closedAt: true
                },
                orderBy: { createdAt: 'asc' }
            });
        }

        // Aggregate by date
        const dailyCounts: Record<string, { count: number; conversions: number; value: number }> = {};

        for (const item of rawData) {
            const date = new Date(item.createdAt).toISOString().split('T')[0];
            if (!dailyCounts[date]) {
                dailyCounts[date] = { count: 0, conversions: 0, value: 0 };
            }
            dailyCounts[date].count++;

            if (entity === 'leads') {
                if (item.status === 'DEAL_CLOSE') {
                    dailyCounts[date].conversions++;
                }
                const budget = parseFloat(item.budget?.replace(/[^0-9.]/g, '') || '0');
                dailyCounts[date].value += budget;
            } else {
                if (item.processStatus === 'APPROVED') {
                    dailyCounts[date].conversions++;
                }
            }
        }

        // Convert to time series
        const countSeries: DataPoint[] = Object.entries(dailyCounts)
            .map(([date, data]) => ({ date, value: data.count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const conversionSeries: DataPoint[] = Object.entries(dailyCounts)
            .map(([date, data]) => ({ date, value: data.conversions }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Calculate moving averages
        const ma7 = calculateMovingAverage(countSeries, 7);
        const ma30 = calculateMovingAverage(countSeries, 30);
        const ma90 = calculateMovingAverage(countSeries, 90);

        // Calculate regression
        const regression = calculateLinearRegression(countSeries);
        const trend = calculateTrend(countSeries);

        // Generate forecasts
        const forecast = forecastTimeSeries(countSeries, forecastDays);
        const scenarios = generateScenarioForecasts(countSeries, forecastDays);

        // Calculate summary metrics
        const totalCount = rawData.length;
        const totalConversions = Object.values(dailyCounts).reduce((sum, d) => sum + d.conversions, 0);
        const conversionRate = totalCount > 0 ? (totalConversions / totalCount * 100).toFixed(1) : '0';

        // Projected metrics
        const avgDailyCount = countSeries.length > 0
            ? countSeries.reduce((sum, d) => sum + d.value, 0) / countSeries.length
            : 0;
        const avgDailyConversions = conversionSeries.length > 0
            ? conversionSeries.reduce((sum, d) => sum + d.value, 0) / conversionSeries.length
            : 0;

        const projectedNextMonth = forecast
            .slice(0, 30)
            .reduce((sum, f) => sum + f.predicted, 0);
        const projectedConversions = projectedNextMonth * (parseFloat(conversionRate) / 100);

        const responseData = {
            entity,
            period: {
                start: countSeries[0]?.date || null,
                end: countSeries[countSeries.length - 1]?.date || null,
                days: countSeries.length
            },
            historical: {
                daily: countSeries,
                conversions: conversionSeries,
                movingAverages: {
                    ma7,
                    ma30,
                    ma90
                }
            },
            analysis: {
                regression: {
                    slope: regression.slope,
                    intercept: regression.intercept,
                    rSquared: regression.rSquared.toFixed(3)
                },
                trend: {
                    direction: trend.direction,
                    strength: trend.strength.toFixed(3),
                    percentChange: trend.percentChange.toFixed(1)
                }
            },
            forecast: {
                predicted: forecast,
                scenarios
            },
            summary: {
                totalCount,
                totalConversions,
                conversionRate: `${conversionRate}%`,
                avgDailyCount: avgDailyCount.toFixed(1),
                avgDailyConversions: avgDailyConversions.toFixed(1),
                projectedNextMonth: Math.round(projectedNextMonth),
                projectedConversions: Math.round(projectedConversions)
            }
        };

        // Cache result
        forecastCache.set(cacheKey, {
            data: responseData,
            expiry: Date.now() + CACHE_TTL
        });

        return NextResponse.json({
            success: true,
            data: responseData
        });
    }
);
