import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { LeadUpdateSchema, validateRequest } from '@/lib/validation/schemas';
import { validateLeadCrossFields } from '@/lib/validation/cross-field-rules';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitLeadUpdated, emitLeadDeleted } from '@/lib/websocket/server';
import { withApiHandler, ApiContext } from '@/lib/api/withApiHandler';
import { requirePermissions, getRecordLevelFilter } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';

// Helper to get params
async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

const getHandler = async (req: NextRequest, context: ApiContext, id: string) => {
    const session = context.session!;

    // Permission check
    const permissionError = await requirePermissions(
        [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED, PERMISSIONS.LEADS_VIEW_ALL],
        false
    )(req);
    if (permissionError) return permissionError;

    // Record level filter
    const recordFilter = await getRecordLevelFilter(session.userId, 'leads', 'view');

    return await withTenant(session.tenantId, async () => {
        const lead = await prisma.lead.findFirst({
            where: {
                id,
                tenantId: session.tenantId,
                ...recordFilter // Apply record-level permissions
            },
            include: { assignedTo: { select: { id: true, name: true } } }
        });

        if (!lead) return notFoundResponse('Lead');

        // Parse JSON fields
        const parsedLead = {
            ...lead,
            mobileNumbers: lead.mobileNumbers ? JSON.parse(lead.mobileNumbers) : [],
            activities: lead.activities ? JSON.parse(lead.activities) : [],
            customFields: lead.customFields ? JSON.parse(lead.customFields) : {},
            submitted_payload: lead.submitted_payload ? JSON.parse(lead.submitted_payload) : {}
        };

        return successResponse(parsedLead);
    });
};

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await getParams(context);
    return withApiHandler(
        { authRequired: true, checkDbHealth: true, rateLimit: 100 },
        (req, ctx) => getHandler(req, ctx, id)
    )(req);
}

const putHandler = async (req: NextRequest, context: ApiContext, id: string) => {
    const session = context.session!;

    // Permission check
    const permissionError = await requirePermissions(
        [PERMISSIONS.LEADS_EDIT_OWN, PERMISSIONS.LEADS_EDIT_ASSIGNED, PERMISSIONS.LEADS_EDIT_ALL],
        false
    )(req);
    if (permissionError) return permissionError;

    // Record level filter for edit? Validating existence and permissions
    const recordFilter = await getRecordLevelFilter(session.userId, 'leads', 'edit');

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
    if (idempotencyError) return idempotencyError;

    const body = await req.json();
    const { version, ...updateData } = body;

    // Version is required for updates
    if (typeof version !== 'number') {
        return validationErrorResponse(['Version field is required for updates']);
    }

    const validation = validateRequest(LeadUpdateSchema, updateData);
    if (!validation.success) return validationErrorResponse(validation.errors!);

    const updates = validation.data!;

    return await withTenant(session.tenantId, async () => {
        const existingLead = await prisma.lead.findFirst({
            where: {
                id,
                tenantId: session.tenantId,
                ...recordFilter
            }
        });

        if (!existingLead) return notFoundResponse('Lead');

        // Validate cross-field rules on the potential new state
        const mergedLead = { ...existingLead, ...updates };
        const crossErrors = validateLeadCrossFields(mergedLead as any);
        if (crossErrors.length > 0) return validationErrorResponse(crossErrors);

        // Capture old data for workflow trigger
        const oldData = existingLead as unknown as Record<string, unknown>;

        // Prepare updates
        const data: any = { ...updates };
        if (updates.mobileNumbers) data.mobileNumbers = JSON.stringify(updates.mobileNumbers);
        if (updates.activities) data.activities = JSON.stringify(updates.activities);
        if (updates.customFields) data.customFields = JSON.stringify(updates.customFields);
        if (updates.submitted_payload) data.submitted_payload = JSON.stringify(updates.submitted_payload);

        try {
            const lead = await updateWithOptimisticLock(
                prisma.lead,
                { id, tenantId: session.tenantId },
                {
                    currentVersion: version,
                    data: {
                        ...data,
                        isUpdated: true
                    }
                },
                'Lead'
            );

            // Audit Log
            await prisma.auditLog.create({
                data: {
                    actionType: 'LEAD_UPDATED',
                    entityType: 'lead',
                    entityId: (lead as any).id,
                    description: `Lead updated: ${(lead as any).company}`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    beforeValue: JSON.stringify(existingLead),
                    afterValue: JSON.stringify(lead)
                }
            });

            // Trigger workflows for lead update
            try {
                await TriggerManager.triggerWorkflows(
                    EntityType.LEAD,
                    (lead as any).id,
                    'UPDATE',
                    oldData,
                    lead as unknown as Record<string, unknown>,
                    session.tenantId,
                    session.userId
                );
            } catch (workflowError) {
                console.error('Failed to trigger workflows for lead update:', workflowError);
            }

            // WebSocket Broadcast
            try {
                await emitLeadUpdated(session.tenantId, lead);
            } catch (wsError) {
                console.error('[WebSocket] Lead update broadcast failed:', wsError);
            }

            const response = successResponse(lead, "Lead updated successfully");
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

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await getParams(context);
    return withApiHandler(
        { authRequired: true, checkDbHealth: true, rateLimit: 30 },
        (req, ctx) => putHandler(req, ctx, id)
    )(req);
}

const deleteHandler = async (req: NextRequest, context: ApiContext, id: string) => {
    const session = context.session!;

    // Permission check
    const permissionError = await requirePermissions([PERMISSIONS.LEADS_DELETE])(req);
    if (permissionError) return permissionError;

    // Start with record level filter for delete
    const recordFilter = await getRecordLevelFilter(session.userId, 'leads', 'delete');

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
    if (idempotencyError) return idempotencyError;

    return await withTenant(session.tenantId, async () => {
        const existingLead = await prisma.lead.findFirst({
            where: {
                id,
                tenantId: session.tenantId,
                ...recordFilter
            }
        });

        if (!existingLead) return notFoundResponse('Lead');

        const lead = await prisma.lead.update({
            where: { id },
            data: { isDeleted: true }
        });

        await prisma.auditLog.create({
            data: {
                actionType: 'LEAD_DELETED',
                entityType: 'lead',
                entityId: id,
                description: 'Lead soft deleted',
                performedById: session.userId,
                tenantId: session.tenantId
            }
        });

        // WebSocket Broadcast
        try {
            await emitLeadDeleted(session.tenantId, id);
        } catch (wsError) {
            console.error('[WebSocket] Lead delete broadcast failed:', wsError);
        }

        const response = successResponse(null, "Lead deleted successfully");
        await storeIdempotencyResult(req, response);
        return response;
    });
};

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await getParams(context);
    return withApiHandler(
        { authRequired: true, checkDbHealth: true, rateLimit: 30 },
        (req, ctx) => deleteHandler(req, ctx, id)
    )(req);
}
