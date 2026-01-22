import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, forbiddenResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { z } from 'zod';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitCaseUpdated } from '@/lib/websocket/server';
import { CaseBulkAssignSchema } from '@/lib/validation/schemas';
import { formatValidationErrors } from '@/lib/middleware/validation';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';

const postHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) return unauthorizedResponse();

    if (!['ADMIN', 'PROCESS_MANAGER'].includes(session.role)) {
        return forbiddenResponse();
    }

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
    if (idempotencyError) return idempotencyError;

    const body = await req.json();
    const validationResult = CaseBulkAssignSchema.safeParse(body);
    if (!validationResult.success) {
        const formatted = formatValidationErrors(validationResult.error);
        return NextResponse.json(formatted, { status: 400 });
    }

    const { caseIds, userId, roleId } = validationResult.data;

    return await withTenant(session.tenantId, async () => {
        const targetUser = await prisma.user.findFirst({
            where: { id: userId, tenantId: session.tenantId }
        });

        if (!targetUser) return validationErrorResponse(['User not found']);

        // Fetch old cases before update for workflow triggers
        const oldCases = await prisma.case.findMany({
            where: {
                caseId: { in: caseIds },
                tenantId: session.tenantId
            }
        });

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

        // WebSocket Broadcast and Workflows
        try {
            const updatedCases = await prisma.case.findMany({
                where: { caseId: { in: caseIds }, tenantId: session.tenantId }
            });

            for (const c of updatedCases) {
                // WebSocket
                emitCaseUpdated(session.tenantId, c);

                // Workflow
                const oldCase = oldCases.find(oc => oc.caseId === c.caseId);
                // Use oldCase if found, otherwise (edge case) use empty or c as fallback? 
                // Using c as fallback would mean no changes detected, which is safe.
                const oldData = oldCase ? (oldCase as unknown as Record<string, unknown>) : {};

                try {
                    await TriggerManager.triggerWorkflows(
                        EntityType.CASE,
                        c.caseId,
                        'UPDATE',
                        oldData,
                        c as unknown as Record<string, unknown>,
                        session.tenantId,
                        session.userId
                    );
                } catch (wfError) {
                    console.error(`[Workflows] Bulk assign trigger failed for case ${c.caseId}:`, wfError);
                }
            }
        } catch (postUpdateError) {
            console.error('Post-update actions (WebSocket/Workflows) failed:', postUpdateError);
        }

        const response = successResponse({ count: caseIds.length }, "Cases assigned successfully");
        await storeIdempotencyResult(req, response);
        return response;
    });
};

export const POST = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 10 }, postHandler);
