import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { successResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { withApiHandler, ApiContext } from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { emitLeadUpdated } from '@/lib/websocket/server';

// Helper to get params
async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

const postHandler = async (req: NextRequest, context: ApiContext, id: string) => {
    const session = context.session!;

    const body = await req.json();
    const { version } = body;

    if (typeof version !== 'number') {
        return validationErrorResponse(['Version field is required for updates']);
    }

    return await withTenant(session.tenantId, async () => {
        const lead = await prisma.lead.findFirst({
            where: { id, tenantId: session.tenantId }
        });

        if (!lead) return notFoundResponse('Lead');

        // Capture old data
        const oldData = lead as unknown as Record<string, unknown>;

        try {
            const updatedLead = await updateWithOptimisticLock(
                prisma.lead,
                { id, tenantId: session.tenantId },
                {
                    currentVersion: version,
                    data: {
                        assignedToId: null,
                        assignedBy: null,
                        assignedAt: null,
                        isUpdated: true
                    }
                },
                'Lead'
            );

            await prisma.auditLog.create({
                data: {
                    actionType: 'LEAD_UNASSIGNED',
                    entityType: 'lead',
                    entityId: id,
                    description: `Lead unassigned`,
                    performedById: session.userId,
                    tenantId: session.tenantId
                }
            });

            // Trigger workflows
            try {
                await TriggerManager.triggerWorkflows(
                    EntityType.LEAD,
                    (updatedLead as any).id,
                    'UPDATE', // Unassignment is an update
                    oldData,
                    updatedLead as unknown as Record<string, unknown>,
                    session.tenantId,
                    session.userId
                );
            } catch (workflowError) {
                console.error('Failed to trigger workflows for lead unassignment:', workflowError);
            }

            // WebSocket Broadcast
            try {
                await emitLeadUpdated(session.tenantId, updatedLead);
            } catch (wsError) {
                console.error('[WebSocket] Lead unassignment broadcast failed:', wsError);
            }

            return successResponse(updatedLead, "Lead unassigned successfully");
        } catch (error) {
            const lockError = handleOptimisticLockError(error);
            if (lockError) {
                return NextResponse.json(lockError, { status: 409 });
            }
            throw error;
        }
    });
};

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await getParams(context);
    return withApiHandler(
        { authRequired: true, checkDbHealth: true, rateLimit: 30, permissions: [PERMISSIONS.LEADS_REASSIGN] },
        (req, ctx) => postHandler(req, ctx, id)
    )(req);
}
