/**
 * SLA Dashboard API Route
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { SLATrackerService } from '@/lib/workflows/sla-tracker';

// GET /api/sla/dashboard
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const dashboard = await SLATrackerService.getDashboardData(session.user.tenantId);

        return NextResponse.json(dashboard);
    } catch (error) {
        console.error('Failed to get SLA dashboard:', error);
        return NextResponse.json({ error: 'Failed to get SLA dashboard' }, { status: 500 });
    }
}
