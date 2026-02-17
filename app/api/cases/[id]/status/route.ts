import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { validateRequest, ProcessStatusEnum } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { z } from 'zod';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { emitCaseUpdated } from '@/lib/websocket/server';

const StatusUpdateSchema = z.object({
    newStatus: ProcessStatusEnum,
    version: z.number().int().min(1, 'Version is required for updates')
});

import { PERMISSIONS } from '@/app/types/permissions';

const patchHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session, params: paramsPromise } = context;
    // session check removed

    const params = await paramsPromise;
    const id = params?.id;
    if (!id) return notFoundResponse('Case');

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session!.tenantId);
    if (idempotencyError) return idempotencyError;

    const body = await req.json();
    const validation = validateRequest(StatusUpdateSchema, body);
    if (!validation.success) return validationErrorResponse(validation.errors!);

    const { newStatus, version } = validation.data!;

    return await withTenant(session!.tenantId, async () => {
        const existingCase = await prisma.case.findFirst({
            where: { caseId: id, tenantId: session!.tenantId }
        });

        if (!existingCase) return notFoundResponse('Case');

        // Capture old data for workflow trigger
        const oldData = existingCase as unknown as Record<string, unknown>;

        // Permission check removed - handled by declarative permissions (CASES_CHANGE_STATUS or specific cases per role)
        // Note: CASES_CHANGE_STATUS is the general permission. 
        // Role-specific field level restriction (e.g. status) is usually handled here if complex,
        // but the plan says "Refactor app/api/cases/[id]/status/route.ts - move to declarative permissions".

        // Valid transition logic
        const updates: any = {
            processStatus: newStatus,
        };

        if (newStatus === 'CLOSED') {
            updates.closedAt = new Date();
        }

        try {
            const updatedCase = await updateWithOptimisticLock(
                prisma.case,
                { caseId: id, tenantId: session!.tenantId },
                { currentVersion: version, data: updates },
                'Case'
            );

            await prisma.auditLog.create({
                data: {
                    actionType: 'CASE_STATUS_UPDATED',
                    entityType: 'case',
                    entityId: id,
                    description: `Case status changed from ${existingCase.processStatus} to ${newStatus}`,
                    performedById: session!.userId,
                    tenantId: session!.tenantId,
                    metadata: JSON.stringify({ oldStatus: existingCase.processStatus, newStatus })
                }
            });

            // Trigger workflows associated with status change (UPDATE event)
            try {
                await TriggerManager.triggerWorkflows(
                    EntityType.CASE,
                    (updatedCase as any).caseId,
                    'UPDATE',
                    oldData,
                    updatedCase as unknown as Record<string, unknown>,
                    session!.tenantId,
                    session!.userId
                );
            } catch (workflowError) {
                console.error('Failed to trigger workflows for case status update:', workflowError);
            }

            // WebSocket Broadcast
            try {
                await emitCaseUpdated(session!.tenantId, updatedCase);
            } catch (wsError) {
                console.error('[WebSocket] Case status update broadcast failed:', wsError);
            }

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
};

export const PATCH = withApiHandler({
    authRequired: true,
    checkDbHealth: true,
    rateLimit: 30,
    permissions: [PERMISSIONS.CASES_CHANGE_STATUS]
}, patchHandler);
