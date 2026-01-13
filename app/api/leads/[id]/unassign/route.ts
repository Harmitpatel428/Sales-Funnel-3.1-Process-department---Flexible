import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response-helpers';
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

        return await withTenant(session.tenantId, async () => {
            const lead = await prisma.lead.findFirst({
                where: { id, tenantId: session.tenantId }
            });

            if (!lead) return notFoundResponse('Lead');

            const updatedLead = await prisma.lead.update({
                where: { id },
                data: {
                    assignedToId: null,
                    assignedBy: null,
                    assignedAt: null
                }
            });

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

            return successResponse(updatedLead, "Lead unassigned successfully");
        });

    } catch (error) {
        return handleApiError(error);
    }
}
