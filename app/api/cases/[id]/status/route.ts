import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { withTenant } from '@/lib/tenant';
import { validateRequest, ProcessStatusEnum } from '@/lib/validation/schemas';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { z } from 'zod';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';

const StatusUpdateSchema = z.object({
    newStatus: ProcessStatusEnum,
    version: z.number().int().min(1, 'Version is required for updates')
});

async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const { id } = await getParams(context);
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        // Check idempotency
        const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
        if (idempotencyError) return idempotencyError;

        const body = await req.json();
        const validation = validateRequest(StatusUpdateSchema, body);
        if (!validation.success) return validationErrorResponse(validation.errors!);

        const { newStatus, version } = validation.data!;

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
            };

            if (newStatus === 'CLOSED') {
                updates.closedAt = new Date();
                // Closure reason could be passed in body, but simpler here
            }

            try {
                const updatedCase = await updateWithOptimisticLock(
                    prisma.case,
                    { caseId: id, tenantId: session.tenantId },
                    { currentVersion: version, data: updates },
                    'Case'
                );

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

                const response = successResponse(updatedCase, "Status updated successfully");
                await storeIdempotencyResult(req, response);
                return response;

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
