import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { ForwardToProcessSchema, validateRequest } from '@/lib/validation/schemas';
import { successResponse, notFoundResponse, errorResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitLeadUpdated, emitCaseCreated } from '@/lib/websocket/server';
import { withApiHandler, ApiContext } from '@/lib/api/withApiHandler';
import { requirePermissions } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';

// Omit leadId from body schema since it's in the URL params
const ForwardSchema = ForwardToProcessSchema.omit({ leadId: true });

// Helper to get params
async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

const postHandler = async (req: NextRequest, context: ApiContext, id: string) => {
    const session = context.session!;

    // Permission check
    const permissionError = await requirePermissions([PERMISSIONS.LEADS_FORWARD])(req);
    if (permissionError) return permissionError;

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
    if (idempotencyError) return idempotencyError;

    // Validation
    const body = await req.json();
    const validation = validateRequest(ForwardSchema, body);
    if (!validation.success) return validationErrorResponse(validation.errors!);

    const { benefitTypes, reason } = validation.data!;

    return await withTenant(session.tenantId, async () => {
        const lead = await prisma.lead.findFirst({
            where: { id, tenantId: session.tenantId }
        });

        if (!lead) return notFoundResponse('Lead');
        if (lead.convertedToCaseId) return errorResponse("Lead already converted", undefined, 400);

        // Capture old data
        const oldData = lead as unknown as Record<string, unknown>;

        // Create cases in transaction
        const caseIds: string[] = [];
        const now = new Date();

        try {
            await prisma.$transaction(async (tx) => {
                for (let i = 0; i < benefitTypes.length; i++) {
                    const type = benefitTypes[i];
                    const caseNumber = `CASE-${Date.now()}-${i + 1}`;

                    const newCase = await tx.case.create({
                        data: {
                            tenantId: session.tenantId,
                            leadId: lead.id,
                            caseNumber: caseNumber,
                            benefitTypes: JSON.stringify([type]),
                            originalLeadData: JSON.stringify(lead),

                            // Denormalized data
                            clientName: lead.clientName || '',
                            company: lead.company,
                            mobileNumber: lead.mobileNumber,
                            consumerNumber: lead.consumerNumber,
                            kva: lead.kva,

                            processStatus: 'PENDING',
                            priority: 'MEDIUM',
                            version: 1
                        }
                    });
                    caseIds.push(newCase.caseId);

                    // Audit Log for Case
                    await tx.auditLog.create({
                        data: {
                            actionType: 'CASE_CREATED',
                            entityType: 'case',
                            entityId: newCase.caseId,
                            description: `Case created from Lead ${lead.company} for ${type}`,
                            performedById: session.userId,
                            tenantId: session.tenantId
                        }
                    });
                }

                // Update Lead with version increment
                await tx.lead.update({
                    where: { id: lead.id },
                    data: {
                        convertedToCaseId: caseIds.join(','),
                        convertedAt: now,
                        isDeleted: true,
                        status: 'WON',
                        version: { increment: 1 }
                    }
                });

                // Audit Log for Lead
                await tx.auditLog.create({
                    data: {
                        actionType: 'LEAD_CONVERTED',
                        entityType: 'lead',
                        entityId: lead.id,
                        description: `Lead converted to ${caseIds.length} cases`,
                        performedById: session.userId,
                        tenantId: session.tenantId,
                        metadata: JSON.stringify({ caseIds, reason })
                    }
                });
            });

            // Trigger workflows
            try {
                // Must fetch updated lead to be safe, or construct it
                const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
                if (updatedLead) {
                    await TriggerManager.triggerWorkflows(
                        EntityType.LEAD,
                        updatedLead.id,
                        'UPDATE', // Conversion is an update in status
                        oldData,
                        updatedLead as unknown as Record<string, unknown>,
                        session.tenantId,
                        session.userId
                    );
                }
            } catch (workflowError) {
                console.error('Failed to trigger workflows for lead conversion:', workflowError);
            }

            // WebSocket Broadcast
            try {
                const [updatedLead, createdCases] = await Promise.all([
                    prisma.lead.findUnique({ where: { id: lead.id } }),
                    prisma.case.findMany({ where: { caseId: { in: caseIds } } })
                ]);

                if (updatedLead) {
                    emitLeadUpdated(session.tenantId, updatedLead);
                }

                for (const caseData of createdCases) {
                    emitCaseCreated(session.tenantId, caseData);
                }
            } catch (wsError) {
                console.error('[WebSocket] Lead forward broadcast failed:', wsError);
            }

            const response = successResponse({ caseIds }, "Lead converted to process successfully");
            await storeIdempotencyResult(req, response);
            return response;

        } catch (error) {
            // Transaction failed
            throw error;
        }
    });
};

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await getParams(context);
    return withApiHandler(
        { authRequired: true, checkDbHealth: true, rateLimit: 30 },
        (req, ctx) => postHandler(req, ctx, id)
    )(req);
}
