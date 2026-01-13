/**
 * Approval API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';
import { ApprovalHandler } from '@/lib/workflows/approval-handler';

const prisma = new PrismaClient();

// GET /api/approvals - List pending approvals for current user
export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const approvals = await ApprovalHandler.getPendingApprovals(
            session.user.id,
            session.user.tenantId
        );

        return NextResponse.json({ approvals });
    } catch (error) {
        console.error('Failed to list approvals:', error);
        return NextResponse.json({ error: 'Failed to list approvals' }, { status: 500 });
    }
}
