import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { validateRequest } from '@/lib/validation/schemas';
import { z } from 'zod';
import { successResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { withApiHandler, ApiContext } from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { emitLeadUpdated } from '@/lib/websocket/server';

const AssignLeadSchema = z.object({
    userId: z.string(),
    assignedBy: z.string().optional(),
    version: z.number().int().min(1, 'Version is required for updates')
});

// Helper to get params
async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

const postHandler = async (req: NextRequest, context: ApiContext, id: string) => {
    const session = context.session!;

    const body = await req.json();
    const validation = validateRequest(AssignLeadSchema, body);
    if (!validation.success) return validationErrorResponse(validation.errors!);

    const { userId, assignedBy, version } = validation.data!;

    return await withTenant(session.tenantId, async () => {
        const lead = await prisma.lead.findFirst({
            where: { id, tenantId: session.tenantId }
        });

        if (!lead) return notFoundResponse('Lead');

        const targetUser = await prisma.user.findFirst({
            where: { id: userId, tenantId: session.tenantId }
        });

        if (!targetUser) return notFoundResponse('User');

        // Capture old data
        const oldData = lead as unknown as Record<string, unknown>;

        try {
            const updatedLead = await updateWithOptimisticLock(
                prisma.lead,
                { id, tenantId: session.tenantId },
                {
                    currentVersion: version,
                    data: {
                        assignedToId: userId,
                        assignedBy: assignedBy,
                        assignedAt: new Date(),
                        isUpdated: true
                    }
                },
                'Lead'
            );

            await prisma.auditLog.create({
                data: {
                    actionType: 'LEAD_ASSIGNED',
                    entityType: 'lead',
                    entityId: id,
                    description: `Lead assigned to ${targetUser.name}`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    metadata: JSON.stringify({ assignedTo: targetUser.id, assignedBy })
                }
            });

            // Trigger workflows
            try {
                await TriggerManager.triggerWorkflows(
                    EntityType.LEAD,
                    (updatedLead as any).id,
                    'UPDATE', // Assignment is an update
                    oldData,
                    updatedLead as unknown as Record<string, unknown>,
                    session.tenantId,
                    session.userId
                );
            } catch (workflowError) {
                console.error('Failed to trigger workflows for lead assignment:', workflowError);
            }

            // WebSocket Broadcast
            try {
                await emitLeadUpdated(session.tenantId, updatedLead);
            } catch (wsError) {
                console.error('[WebSocket] Lead assignment broadcast failed:', wsError);
            }

            return successResponse(updatedLead, "Lead assigned successfully");
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
        { authRequired: true, checkDbHealth: true, rateLimit: 30, permissions: [PERMISSIONS.LEADS_ASSIGN] },
        (req, ctx) => postHandler(req, ctx, id)
    )(req);
}
