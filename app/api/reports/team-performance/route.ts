import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * GET /api/reports/team-performance
 * Fetch team performance analytics
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.REPORTS_VIEW_TEAM]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const range = searchParams.get('range') || 'month';
        const userIds = searchParams.get('userIds')?.split(',').filter(Boolean);

        // Calculate date range
        const now = new Date();
        let startDate: Date;

        switch (range) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'quarter':
                const quarterStart = Math.floor(now.getMonth() / 3) * 3;
                startDate = new Date(now.getFullYear(), quarterStart, 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        // Fetch users in tenant
        const users = await prisma.user.findMany({
            where: {
                tenantId: session.tenantId,
                isActive: true,
                ...(userIds && userIds.length > 0 ? { id: { in: userIds } } : {})
            },
            select: {
                id: true,
                name: true,
                role: true
            }
        });

        // Fetch leads data
        const leads = await prisma.lead.findMany({
            where: {
                tenantId: session.tenantId,
                isDeleted: false,
                createdAt: { gte: startDate }
            },
            select: {
                id: true,
                assignedToId: true,
                status: true,
                budget: true,
                createdAt: true
            }
        });

        // Fetch cases data
        const cases = await prisma.case.findMany({
            where: {
                tenantId: session.tenantId,
                createdAt: { gte: startDate }
            },
            select: {
                caseId: true,
                assignedProcessUserId: true,
                processStatus: true,
                createdAt: true,
                closedAt: true
            }
        });

        // Calculate stats per user
        const stats = users.map(user => {
            // Lead stats
            const userLeads = leads.filter(l => l.assignedToId === user.id);
            const leadsAssigned = userLeads.length;
            const leadsClosed = userLeads.filter(l => l.status === 'DEAL_CLOSE').length;
            const conversionRate = leadsAssigned > 0 ? (leadsClosed / leadsAssigned) * 100 : 0;

            // Pipeline value
            const pipelineValue = userLeads.reduce((sum, l) => {
                const budget = parseFloat(l.budget?.replace(/[^0-9.]/g, '') || '0');
                return sum + budget;
            }, 0);

            const avgDealSize = leadsClosed > 0 ? pipelineValue / leadsClosed : 0;

            // Case stats
            const userCases = cases.filter(c => c.assignedProcessUserId === user.id);
            const casesProcessed = userCases.length;
            const casesApproved = userCases.filter(c => c.processStatus === 'APPROVED').length;

            // Resolution time
            const closedCases = userCases.filter(c => c.closedAt);
            let avgResolutionDays = 0;
            if (closedCases.length > 0) {
                const totalDays = closedCases.reduce((sum, c) => {
                    const created = new Date(c.createdAt);
                    const closed = new Date(c.closedAt!);
                    return sum + ((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                }, 0);
                avgResolutionDays = totalDays / closedCases.length;
            }

            return {
                userId: user.id,
                name: user.name,
                role: user.role,
                leadsAssigned,
                leadsClosed,
                conversionRate,
                pipelineValue,
                avgDealSize,
                avgResolutionDays,
                casesProcessed,
                casesApproved
            };
        });

        // Calculate daily trends per user
        const trends: Record<string, { date: string; leads: number; conversions: number; cases: number }[]> = {};

        for (const user of users) {
            const userLeads = leads.filter(l => l.assignedToId === user.id);
            const userCases = cases.filter(c => c.assignedProcessUserId === user.id);

            const dailyData: Record<string, { leads: number; conversions: number; cases: number }> = {};

            userLeads.forEach(l => {
                const date = new Date(l.createdAt).toISOString().split('T')[0];
                if (!dailyData[date]) {
                    dailyData[date] = { leads: 0, conversions: 0, cases: 0 };
                }
                dailyData[date].leads++;
                if (l.status === 'DEAL_CLOSE') {
                    dailyData[date].conversions++;
                }
            });

            userCases.forEach(c => {
                const date = new Date(c.createdAt).toISOString().split('T')[0];
                if (!dailyData[date]) {
                    dailyData[date] = { leads: 0, conversions: 0, cases: 0 };
                }
                dailyData[date].cases++;
            });

            trends[user.id] = Object.entries(dailyData)
                .map(([date, data]) => ({ date, ...data }))
                .sort((a, b) => a.date.localeCompare(b.date));
        }

        return NextResponse.json({
            success: true,
            data: {
                stats,
                trends,
                period: {
                    start: startDate.toISOString(),
                    end: now.toISOString(),
                    range
                }
            }
        });
    }
);
