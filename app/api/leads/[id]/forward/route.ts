import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { ForwardToProcessSchema, validateRequest } from '@/lib/validation/schemas';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse, errorResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitLeadUpdated, emitCaseCreated } from '@/lib/websocket/server';

async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const { id } = await getParams(context);
        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        // Check idempotency
        const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
        if (idempotencyError) return idempotencyError;

        const body = await req.json();
        const validation = validateRequest(ForwardToProcessSchema, body);
        if (!validation.success) return validationErrorResponse(validation.errors!);

        const { benefitTypes, reason } = validation.data!;

        return await withTenant(session.tenantId, async () => {
            const lead = await prisma.lead.findFirst({
                where: { id, tenantId: session.tenantId }
            });

            if (!lead) return notFoundResponse('Lead');
            if (lead.convertedToCaseId) return errorResponse("Lead already converted", undefined, 400);

            // Create cases in transaction
            const caseIds: string[] = [];
            const now = new Date();

            await prisma.$transaction(async (tx) => {
                // Create one case per benefit type? Or one case with multiple benefits?
                // User prompt said: "Create Case(s) based on benefitTypes (one case per benefit type)"

                // Need to generate case number. Simple counter or random for now.
                // In real app, might need a atomic counter or simpler format.
                // Using timestamp + index for uniqueness + simplicity here.

                for (let i = 0; i < benefitTypes.length; i++) {
                    const type = benefitTypes[i];
                    const caseNumber = `CASE-${Date.now()}-${i + 1}`;

                    const newCase = await tx.case.create({
                        data: {
                            tenantId: session.tenantId,
                            leadId: lead.id,
                            caseNumber: caseNumber,
                            benefitTypes: JSON.stringify([type]), // Single benefit per case as per instruction? Or list? "One case per benefit type" implies separate cases.
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
                        convertedToCaseId: caseIds.join(','), // Store all IDs? Schema says String?, so maybe first ID or serialized list.
                        convertedAt: now,
                        isDeleted: true, // Pseudo-delete as per requirements ("isDeleted: true")
                        status: 'WON', // Usually converted leads are won
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

            // WebSocket Broadcast
            try {
                // Fetch updated data for accurate broadcast
                const [updatedLead, createdCases] = await Promise.all([
                    prisma.lead.findUnique({ where: { id: lead.id } }),
                    prisma.case.findMany({ where: { caseId: { in: caseIds } } })
                ]);

                if (updatedLead) {
                    emitLeadUpdated(session.tenantId, updatedLead, session.userId);
                }

                for (const caseData of createdCases) {
                    emitCaseCreated(session.tenantId, caseData, session.userId);
                }
            } catch (wsError) {
                console.error('[WebSocket] Lead forward broadcast failed:', wsError);
            }

            const response = successResponse({ caseIds }, "Lead converted to process successfully");
            await storeIdempotencyResult(req, response);
            return response;
        });
    } catch (error) {
        return handleApiError(error);
    }
}
