import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { AssignLeadSchema, validateRequest } from '@/lib/validation/schemas';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';

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

            const updatedLead = await prisma.lead.update({
                where: { id },
                data: {
                    assignedToId: userId,
                    assignedBy: assignedBy,
                    assignedAt: new Date()
                }
            });

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
        });

    } catch (error) {
        return handleApiError(error);
    }
}
