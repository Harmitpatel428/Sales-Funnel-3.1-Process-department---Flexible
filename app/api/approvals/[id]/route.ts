/**
 * Individual Approval API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from '@/lib/auth';
import { ApprovalHandler } from '@/lib/workflows/approval-handler';

const prisma = new PrismaClient();

interface RouteParams {
    params: { id: string };
}

// GET /api/approvals/[id]
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const approval = await prisma.approvalRequest.findFirst({
            where: { id: params.id, tenantId: session.user.tenantId },
            include: {
                requestedBy: { select: { id: true, name: true, email: true } },
                workflowExecution: { include: { workflow: true } }
            }
        });

        if (!approval) {
            return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
        }

        return NextResponse.json({
            ...approval,
            approverIds: JSON.parse(approval.approverIds),
            approvedBy: JSON.parse(approval.approvedBy),
            metadata: JSON.parse(approval.metadata)
        });
    } catch (error) {
        console.error('Failed to get approval:', error);
        return NextResponse.json({ error: 'Failed to get approval' }, { status: 500 });
    }
}

// POST /api/approvals/[id]/approve or /api/approvals/[id]/reject
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { action, comments } = body;

        if (!['approve', 'reject'].includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const result = await ApprovalHandler.submitApproval(
            params.id,
            session.user.id,
            action === 'approve' ? 'APPROVE' : 'REJECT',
            comments
        );

        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to process approval:', error);
        return NextResponse.json({
            error: (error as Error).message || 'Failed to process approval'
        }, { status: 500 });
    }
}

// DELETE /api/approvals/[id] - Cancel approval
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getServerSession();
        if (!session?.user?.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ApprovalHandler.cancelApproval(params.id, session.user.id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to cancel approval:', error);
        return NextResponse.json({
            error: (error as Error).message || 'Failed to cancel approval'
        }, { status: 500 });
    }
}
