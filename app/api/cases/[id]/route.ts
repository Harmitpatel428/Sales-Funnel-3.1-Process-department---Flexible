import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { CaseUpdateSchema, validateRequest } from '@/lib/validation/schemas';
import { validateCaseCrossFields } from '@/lib/validation/cross-field-rules';
import { successResponse, notFoundResponse, validationErrorResponse, forbiddenResponse, unauthorizedResponse } from '@/lib/api/response-helpers';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitCaseUpdated, emitCaseDeleted } from '@/lib/websocket/server';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';
import { getRecordLevelFilter } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';

const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session, params: paramsPromise } = context;
    // session check removed

    const params = await paramsPromise;
    const id = params?.id;
    if (!id) return notFoundResponse('Case');

    return await withTenant(session!.tenantId, async () => {
        const recordFilter = await getRecordLevelFilter(session!.userId, 'cases', 'view');

        const baseCase = await prisma.case.findFirst({
            where: { caseId: id, tenantId: session!.tenantId }
        });

        if (!baseCase) return notFoundResponse('Case');

        const caseItem = await prisma.case.findFirst({
            where: {
                caseId: id,
                tenantId: session!.tenantId,
                ...recordFilter
            },
            include: { users: { select: { id: true, name: true } } }
        });

        if (!caseItem) return forbiddenResponse();

        // Manual visibility check removed - handled by declarative permissions (VIEW_OWN/VIEW_ASSIGNED/VIEW_ALL)

        const parsedCase = {
            ...caseItem,
            benefitTypes: caseItem.benefitTypes ? JSON.parse(caseItem.benefitTypes) : [],
            contacts: caseItem.contacts ? JSON.parse(caseItem.contacts) : [],
            originalLeadData: caseItem.originalLeadData ? JSON.parse(caseItem.originalLeadData) : {}
        };

        return successResponse(parsedCase);
    });
};

const putHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session, params: paramsPromise } = context;
    // session check removed

    const params = await paramsPromise;
    const id = params?.id;
    if (!id) return notFoundResponse('Case');

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session!.tenantId);
    if (idempotencyError) return idempotencyError;

    const body = await req.json();
    const { version, ...updateData } = body;

    // Version is required for updates
    if (typeof version !== 'number') {
        return validationErrorResponse(['Version field is required for updates']);
    }

    const validation = validateRequest(CaseUpdateSchema, updateData);
    if (!validation.success) return validationErrorResponse(validation.errors!);

    const updates = validation.data!;

    return await withTenant(session!.tenantId, async () => {
        const recordFilter = await getRecordLevelFilter(session!.userId, 'cases', 'edit');

        const baseCase = await prisma.case.findFirst({
            where: { caseId: id, tenantId: session!.tenantId }
        });

        if (!baseCase) return notFoundResponse('Case');

        const existingCase = await prisma.case.findFirst({
            where: {
                caseId: id,
                tenantId: session!.tenantId,
                ...recordFilter
            }
        });

        if (!existingCase) return forbiddenResponse();

        // Validate cross-field rules
        const mergedCase = { ...existingCase, ...updates };
        const crossErrors = validateCaseCrossFields(mergedCase as any);
        if (crossErrors.length > 0) return validationErrorResponse(crossErrors);

        // Capture old data for workflow trigger
        const oldData = existingCase as unknown as Record<string, unknown>;

        // Permission checks removed - handled by declarative permissions

        const data: any = { ...updates };
        if (updates.benefitTypes) data.benefitTypes = JSON.stringify(updates.benefitTypes);
        if (updates.contacts) data.contacts = JSON.stringify(updates.contacts);
        if (updates.originalLeadData) data.originalLeadData = JSON.stringify(updates.originalLeadData);

        try {
            const updatedCase = await updateWithOptimisticLock(
                prisma.case,
                { caseId: id, tenantId: session!.tenantId, ...recordFilter },
                { currentVersion: version, data },
                'Case'
            );

            await prisma.auditLog.create({
                data: {
                    actionType: 'CASE_UPDATED',
                    entityType: 'case',
                    entityId: id,
                    description: `Case updated: ${(updatedCase as any).caseNumber}`,
                    performedById: session!.userId,
                    tenantId: session!.tenantId,
                    beforeValue: JSON.stringify(existingCase),
                    afterValue: JSON.stringify(updatedCase)
                }
            });

            // Trigger workflows for case update
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
                console.error('Failed to trigger workflows for case update:', workflowError);
            }

            // WebSocket Broadcast
            try {
                await emitCaseUpdated(session!.tenantId, updatedCase);
            } catch (wsError) {
                console.error('[WebSocket] Case update broadcast failed:', wsError);
            }

            const response = successResponse(updatedCase, "Case updated successfully");
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

const deleteHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session, params: paramsPromise } = context;
    // session check removed

    const params = await paramsPromise;
    const id = params?.id;
    if (!id) return notFoundResponse('Case');

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session!.tenantId);
    if (idempotencyError) return idempotencyError;

    // Manual role check removed - handled by declarative permissions (CASES_DELETE)

    return await withTenant(session!.tenantId, async () => {
        // Hard delete as per plan
        await prisma.case.delete({
            where: { caseId: id }
        });

        await prisma.auditLog.create({
            data: {
                actionType: 'CASE_DELETED',
                entityType: 'case',
                entityId: id,
                description: `Case deleted permanently`,
                performedById: session!.userId,
                tenantId: session!.tenantId
            }
        });

        // WebSocket Broadcast
        try {
            await emitCaseDeleted(session!.tenantId, id);
        } catch (wsError) {
            console.error('[WebSocket] Case delete broadcast failed:', wsError);
        }

        const response = successResponse(null, "Case deleted successfully");
        await storeIdempotencyResult(req, response);
        return response;
    });
};

export const GET = withApiHandler({
    authRequired: true,
    checkDbHealth: true,
    rateLimit: 100,
    permissions: [PERMISSIONS.CASES_VIEW_OWN, PERMISSIONS.CASES_VIEW_ASSIGNED, PERMISSIONS.CASES_VIEW_ALL],
    requireAll: false
}, getHandler);

export const PUT = withApiHandler({
    authRequired: true,
    checkDbHealth: true,
    rateLimit: 30,
    permissions: [PERMISSIONS.CASES_EDIT_OWN, PERMISSIONS.CASES_EDIT_ASSIGNED, PERMISSIONS.CASES_EDIT_ALL],
    requireAll: false
}, putHandler);

export const DELETE = withApiHandler({
    authRequired: true,
    checkDbHealth: true,
    rateLimit: 30,
    permissions: [PERMISSIONS.CASES_DELETE]
}, deleteHandler);
