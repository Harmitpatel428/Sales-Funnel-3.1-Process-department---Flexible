import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { withTenant } from '@/lib/tenant';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { NextResponse } from 'next/server';

async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const { id } = await getParams(context);
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

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

            try {
                const updatedLead = await updateWithOptimisticLock(
                    prisma.lead,
                    { id, tenantId: session.tenantId },
                    {
                        currentVersion: version,
                        data: {
                            assignedToId: null,
                            assignedBy: null,
                            assignedAt: null
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

                return successResponse(updatedLead, "Lead unassigned successfully");
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
