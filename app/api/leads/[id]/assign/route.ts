import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { validateRequest } from '@/lib/validation/schemas';
import { z } from 'zod';

const AssignLeadSchema = z.object({
    userId: z.string(),
    assignedBy: z.string().optional(),
    version: z.number().int().min(1, 'Version is required for updates')
});
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';

async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const { id } = await getParams(context);
        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        const body = await req.json();
        const validation = validateRequest(AssignLeadSchema, body);
        if (!validation.success) return validationErrorResponse(validation.errors!);

        const { userId, assignedBy } = validation.data!;

        // Permission check? 
        // if (!['ADMIN', 'SALES_MANAGER'].includes(session.role)) return forbiddenResponse();

        return await withTenant(session.tenantId, async () => {
            const lead = await prisma.lead.findFirst({
                where: { id, tenantId: session.tenantId }
            });

            if (!lead) return notFoundResponse('Lead');

            const targetUser = await prisma.user.findFirst({
                where: { id: userId, tenantId: session.tenantId }
            });

            if (!targetUser) return notFoundResponse('User');

            // Extraction of version should happen before this, but let's ensure it's in the schema or body
            const version = (body as any).version;
            if (typeof version !== 'number') {
                return validationErrorResponse(['Version field is required for updates']);
            }

            try {
                const updatedLead = await updateWithOptimisticLock(
                    prisma.lead,
                    { id, tenantId: session.tenantId },
                    {
                        currentVersion: version,
                        data: {
                            assignedToId: userId,
                            assignedBy: assignedBy,
                            assignedAt: new Date()
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

                return successResponse(updatedLead, "Lead assigned successfully");
            } catch (error) {
                const lockError = handleOptimisticLockError(error);
                if (lockError) {
                    return NextResponse.json(lockError, { status: 409 });
                }
                throw error;
            }
        });

    } catch (error) {
        return handleApiError(error);
    }
}
