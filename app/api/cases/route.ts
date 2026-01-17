import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { withTenant } from '@/lib/tenant';
import { CaseSchema, CaseFiltersSchema } from '@/lib/validation/schemas';
import { validateCaseCrossFields } from '@/lib/validation/cross-field-rules';
import { withValidation, ValidatedRequest } from '@/lib/middleware/validation';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { Prisma } from '@prisma/client';
import { getRecordLevelFilter } from '@/lib/middleware/permissions';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { emitCaseCreated } from '@/lib/websocket/server';
import { z } from 'zod';

export const GET = withValidation(CaseFiltersSchema)(async (req: ValidatedRequest<z.infer<typeof CaseFiltersSchema>>) => {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 100);
        if (rateLimitError) return rateLimitError;

        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        const filters = req.validatedData;

        // Get record-level filter
        const recordFilter = await getRecordLevelFilter(session.userId, 'cases', 'view');

        return await withTenant(session.tenantId, async () => {
            const where: Prisma.CaseWhereInput = {
                tenantId: session.tenantId,
                ...recordFilter, // Apply record-level permissions
            };

            // Role-based visibility
            if (session.role === 'PROCESS_EXECUTIVE') {
                where.assignedProcessUserId = session.userId;
            }

            if (filters.status) {
                where.processStatus = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
            }

            if (filters.priority) {
                where.priority = filters.priority;
            }

            if (filters.assignedTo) {
                where.assignedProcessUserId = filters.assignedTo;
            }

            if (filters.search) {
                where.OR = [
                    { caseNumber: { contains: filters.search } },
                    { clientName: { contains: filters.search } },
                    { company: { contains: filters.search } },
                    { mobileNumber: { contains: filters.search } }
                ];
            }

            const page = filters.page || 1;
            const limit = filters.limit || 50;
            const skip = (page - 1) * limit;

            const [cases, total] = await Promise.all([
                prisma.case.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit,
                    include: {
                        users: { select: { id: true, name: true, email: true } }
                    }
                }),
                prisma.case.count({ where })
            ]);

            const parsedCases = cases.map(c => ({
                ...c,
                benefitTypes: c.benefitTypes ? JSON.parse(c.benefitTypes) : [],
                contacts: c.contacts ? JSON.parse(c.contacts) : [],
                originalLeadData: c.originalLeadData ? JSON.parse(c.originalLeadData) : {}
            }));

            return successResponse({ cases: parsedCases, total, page, totalPages: Math.ceil(total / limit) });
        });

    } catch (error) {
        return handleApiError(error);
    }
});

export const POST = withValidation(CaseSchema)(async (req: ValidatedRequest<z.infer<typeof CaseSchema>>) => {
    try {
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        // Check permissions
        if (!['ADMIN', 'PROCESS_MANAGER', 'SALES_MANAGER'].includes(session.role)) {
            // Technically sales managers might forward leads which creates cases via /forward endpoint,
            // but direct case creation might be restricted.
        }

        const data = req.validatedData;

        const crossErrors = validateCaseCrossFields(data as any);
        if (crossErrors.length > 0) return validationErrorResponse(crossErrors);

        return await withTenant(session.tenantId, async () => {
            // Stringify JSON fields
            const caseData: any = { ...data };
            if (data.benefitTypes) caseData.benefitTypes = JSON.stringify(data.benefitTypes);
            if (data.contacts) caseData.contacts = JSON.stringify(data.contacts);
            if (data.originalLeadData) caseData.originalLeadData = JSON.stringify(data.originalLeadData);

            const newCase = await prisma.case.create({
                data: {
                    ...caseData,
                    tenantId: session.tenantId,
                }
            });

            await prisma.auditLog.create({
                data: {
                    actionType: 'CASE_CREATED',
                    entityType: 'case',
                    entityId: newCase.caseId,
                    description: `Case created manually: ${newCase.caseNumber}`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    afterValue: JSON.stringify(newCase)
                }
            });

            // Trigger workflows for case creation
            try {
                await TriggerManager.triggerWorkflows(
                    EntityType.CASE,
                    newCase.caseId,
                    'CREATE',
                    null,
                    newCase as unknown as Record<string, unknown>,
                    session.tenantId,
                    session.userId
                );
            } catch (workflowError) {
                console.error('Failed to trigger workflows for case creation:', workflowError);
            }

            // WebSocket Broadcast
            try {
                await emitCaseCreated(session.tenantId, newCase);
            } catch (wsError) {
                console.error('[WebSocket] Case creation broadcast failed:', wsError);
            }

            return successResponse(newCase, "Case created successfully");
        });
    } catch (error) {
        return handleApiError(error);
    }
});
