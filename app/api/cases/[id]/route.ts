import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { CaseUpdateSchema, validateRequest } from '@/lib/validation/schemas';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, forbiddenResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';

async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await getParams(context);
        const session = await getSession();
        if (!session) return unauthorizedResponse();

        return await withTenant(session.tenantId, async () => {
            const caseItem = await prisma.case.findFirst({
                where: { caseId: id, tenantId: session.tenantId },
                include: { assignedProcessUser: { select: { id: true, name: true } } }
            });

            if (!caseItem) return notFoundResponse('Case');

            // Check visibility
            if (session.role === 'PROCESS_EXECUTIVE' && caseItem.assignedProcessUserId !== session.userId) {
                // Can executivies see all cases or only theirs? Plan says "PROCESS_EXECUTIVE sees only assigned cases" in List API.
                // Probably should enforce here too.
                return forbiddenResponse();
            }

            const parsedCase = {
                ...caseItem,
                benefitTypes: caseItem.benefitTypes ? JSON.parse(caseItem.benefitTypes) : [],
                contacts: caseItem.contacts ? JSON.parse(caseItem.contacts) : [],
                originalLeadData: caseItem.originalLeadData ? JSON.parse(caseItem.originalLeadData) : {}
            };

            return successResponse(parsedCase);
        });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await getParams(context);
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        const body = await req.json();
        const validation = validateRequest(CaseUpdateSchema, body);
        if (!validation.success) return validationErrorResponse(validation.errors!);

        const updates = validation.data!;

        return await withTenant(session.tenantId, async () => {
            const existingCase = await prisma.case.findFirst({
                where: { caseId: id, tenantId: session.tenantId }
            });

            if (!existingCase) return notFoundResponse('Case');

            // Capture old data for workflow trigger
            const oldData = existingCase as unknown as Record<string, unknown>;

            // Permission checks
            // Manager/Admin can update anything.
            // Executive can update status or notes? For now assuming full update allowed if assigned.
            if (session.role === 'PROCESS_EXECUTIVE' && existingCase.assignedProcessUserId !== session.userId) {
                return forbiddenResponse();
            }

            const data: any = { ...updates };
            if (updates.benefitTypes) data.benefitTypes = JSON.stringify(updates.benefitTypes);
            if (updates.contacts) data.contacts = JSON.stringify(updates.contacts);
            if (updates.originalLeadData) data.originalLeadData = JSON.stringify(updates.originalLeadData);

            const updatedCase = await prisma.case.update({
                where: { caseId: id },
                data: {
                    ...data,
                    updatedAt: new Date()
                }
            });

            await prisma.auditLog.create({
                data: {
                    actionType: 'CASE_UPDATED',
                    entityType: 'case',
                    entityId: id,
                    description: `Case updated: ${updatedCase.caseNumber}`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    beforeValue: JSON.stringify(existingCase),
                    afterValue: JSON.stringify(updatedCase)
                }
            });

            // Trigger workflows for case update
            try {
                await TriggerManager.triggerWorkflows(
                    EntityType.CASE,
                    updatedCase.caseId,
                    'UPDATE',
                    oldData,
                    updatedCase as unknown as Record<string, unknown>,
                    session.tenantId,
                    session.userId
                );
            } catch (workflowError) {
                console.error('Failed to trigger workflows for case update:', workflowError);
            }

            return successResponse(updatedCase, "Case updated successfully");
        });

    } catch (error) {
        return handleApiError(error);
    }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await getParams(context);
        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        if (!['ADMIN', 'PROCESS_MANAGER'].includes(session.role)) {
            return forbiddenResponse();
        }

        return await withTenant(session.tenantId, async () => {
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
                    performedById: session.userId,
                    tenantId: session.tenantId
                }
            });

            return successResponse(null, "Case deleted successfully");
        });
    } catch (error) {
        return handleApiError(error);
    }
}
