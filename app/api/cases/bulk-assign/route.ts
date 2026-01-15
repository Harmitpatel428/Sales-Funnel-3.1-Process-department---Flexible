import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, forbiddenResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { z } from 'zod';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitCaseUpdated } from '@/lib/websocket/server';
import { CaseBulkAssignSchema } from '@/lib/validation/schemas';
import { withValidation, ValidatedRequest } from '@/lib/middleware/validation';

export const POST = withValidation(CaseBulkAssignSchema)(async (req: ValidatedRequest<z.infer<typeof CaseBulkAssignSchema>>) => {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 10);
        if (rateLimitError) return rateLimitError;

        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        if (!['ADMIN', 'PROCESS_MANAGER'].includes(session.role)) {
            return forbiddenResponse();
        }

        // Check idempotency
        const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
        if (idempotencyError) return idempotencyError;

        // Validation handled by middleware
        const { caseIds, userId, roleId } = req.validatedData;

        return await withTenant(session.tenantId, async () => {
            const targetUser = await prisma.user.findFirst({
                where: { id: userId, tenantId: session.tenantId }
            });

            if (!targetUser) return validationErrorResponse(['User not found']);

            // Transaction for bulk update
            await prisma.$transaction(async (tx) => {
                // Update cases with version increment
                const updateResult = await tx.case.updateMany({
                    where: {
                        caseId: { in: caseIds },
                        tenantId: session.tenantId
                    },
                    data: {
                        assignedProcessUserId: userId,
                        assignedRole: roleId || 'PROCESS_EXECUTIVE',
                        updatedAt: new Date(),
                        version: { increment: 1 }
                    }
                });

                // Create audit logs (aggregated)
                await tx.auditLog.create({
                    data: {
                        actionType: 'CASE_BULK_ASSIGNED',
                        entityType: 'case',
                        description: `Bulk assigned ${updateResult.count} cases to ${targetUser.name}`,
                        performedById: session.userId,
                        tenantId: session.tenantId,
                        metadata: JSON.stringify({ caseIds, assignedTo: userId })
                    }
                });
            });

            // WebSocket Broadcast
            try {
                const updatedCases = await prisma.case.findMany({
                    where: { caseId: { in: caseIds }, tenantId: session.tenantId }
                });
                for (const c of updatedCases) {
                    emitCaseUpdated(session.tenantId, c);
                }
            } catch (wsError) {
                console.error('[WebSocket] Bulk assign broadcast failed:', wsError);
            }

            const response = successResponse({ count: caseIds.length }, "Cases assigned successfully");
            await storeIdempotencyResult(req, response);
            return response;
        });

    } catch (error) {
        return handleApiError(error);
    }
});
