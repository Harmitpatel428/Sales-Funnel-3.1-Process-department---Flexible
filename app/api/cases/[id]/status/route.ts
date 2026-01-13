import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { validateRequest, ProcessStatusEnum } from '@/lib/validation/schemas';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { z } from 'zod';

const StatusUpdateSchema = z.object({
    newStatus: ProcessStatusEnum
});

async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const { id } = await getParams(context);
        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        const body = await req.json();
        const validation = validateRequest(StatusUpdateSchema, body);
        if (!validation.success) return validationErrorResponse(validation.errors!);

        const { newStatus } = validation.data!;

        return await withTenant(session.tenantId, async () => {
            const existingCase = await prisma.case.findFirst({
                where: { caseId: id, tenantId: session.tenantId }
            });

            if (!existingCase) return notFoundResponse('Case');

            // Authorization check
            if (session.role === 'PROCESS_EXECUTIVE' && existingCase.assignedProcessUserId !== session.userId) {
                return forbiddenResponse();
            }

            // Valid transition logic could go here (e.g. can't go from CLOSED to PENDING)

            const updates: any = {
                processStatus: newStatus,
                updatedAt: new Date()
            };

            if (newStatus === 'CLOSED') {
                updates.closedAt = new Date();
                // Closure reason could be passed in body, but simpler here
            }

            const updatedCase = await prisma.case.update({
                where: { caseId: id },
                data: updates
            });

            await prisma.auditLog.create({
                data: {
                    actionType: 'CASE_STATUS_UPDATED',
                    entityType: 'case',
                    entityId: id,
                    description: `Case status changed from ${existingCase.processStatus} to ${newStatus}`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    metadata: JSON.stringify({ oldStatus: existingCase.processStatus, newStatus })
                }
            });

            return successResponse(updatedCase, "Status updated successfully");
        });

    } catch (error) {
        return handleApiError(error);
    }
}
