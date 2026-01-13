import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { z } from 'zod';

const BulkAssignSchema = z.object({
    caseIds: z.array(z.string()),
    userId: z.string(),
    roleId: z.string().optional()
});

export async function POST(req: NextRequest) {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 10);
        if (rateLimitError) return rateLimitError;

        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        if (!['ADMIN', 'PROCESS_MANAGER'].includes(session.role)) {
            return forbiddenResponse();
        }

        const body = await req.json();
        const validation = BulkAssignSchema.safeParse(body);
        if (!validation.success) return validationErrorResponse(validation.error.errors.map(e => e.message));

        const { caseIds, userId, roleId } = validation.data;

        return await withTenant(session.tenantId, async () => {
            const targetUser = await prisma.user.findFirst({
                where: { id: userId, tenantId: session.tenantId }
            });

            if (!targetUser) return validationErrorResponse(['User not found']);

            // Transaction for bulk update
            await prisma.$transaction(async (tx) => {
                // Update cases
                const updateResult = await tx.case.updateMany({
                    where: {
                        caseId: { in: caseIds },
                        tenantId: session.tenantId
                    },
                    data: {
                        assignedProcessUserId: userId,
                        assignedRole: roleId || 'PROCESS_EXECUTIVE',
                        updatedAt: new Date()
                    }
                });

                // Create audit logs (one aggregated log or one per case? Aggregated better for bulk)
                await tx.auditLog.create({
                    data: {
                        actionType: 'CASE_BULK_ASSIGNED',
                        entityType: 'case', // generic
                        description: `Bulk assigned ${updateResult.count} cases to ${targetUser.name}`,
                        performedById: session.userId,
                        tenantId: session.tenantId,
                        metadata: JSON.stringify({ caseIds, assignedTo: userId })
                    }
                });
            });

            return successResponse({ count: caseIds.length }, "Cases assigned successfully");
        });

    } catch (error) {
        return handleApiError(error);
    }
}
