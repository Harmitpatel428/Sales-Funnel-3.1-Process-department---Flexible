import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { LeadSchema, LeadFiltersSchema } from '@/lib/validation/schemas';
import { validateLeadCrossFields } from '@/lib/validation/cross-field-rules'; // Prepare import, might need file creation check? it exists.
import { withValidation, ValidatedRequest } from '@/lib/middleware/validation';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { Prisma } from '@prisma/client';
import { requirePermissions, getRecordLevelFilter } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { emitLeadCreated } from '@/lib/websocket/server';

export const GET = withValidation(LeadFiltersSchema)(async (req: ValidatedRequest<typeof LeadFiltersSchema._output>) => {
    try {
        // 1. Rate Limiting
        const rateLimitError = await rateLimitMiddleware(req, 100);
        if (rateLimitError) return rateLimitError;


        // 2. Authentication
        const session = await getSession();

        logRequest(req, session);

        if (!session) return unauthorizedResponse();

        // Permission check
        const permissionError = await requirePermissions(
            [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED, PERMISSIONS.LEADS_VIEW_ALL],
            false // require any
        )(req);

        if (permissionError) return permissionError;

        // Get record-level filter
        const recordFilter = await getRecordLevelFilter(session.userId, 'leads', 'view');

        // 3. Validation - Handled by Middleware
        const filters = req.validatedData;

        // 4. Execution
        return await withTenant(session.tenantId, async () => {
            const where: Prisma.LeadWhereInput = {
                tenantId: session.tenantId,
                isDeleted: false,
                ...recordFilter, // Apply record-level permissions
                // Default to active leads unless specified
                isDone: filters.isDone !== undefined ? filters.isDone : false,
            };

            if (filters.status) {
                where.status = Array.isArray(filters.status)
                    ? { in: filters.status }
                    : filters.status;
            }

            if (filters.assignedTo) {
                where.assignedToId = filters.assignedTo;
            }

            if (filters.startDate || filters.endDate) {
                where.createdAt = {};
                if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
                if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
            }

            // Search Logic
            if (filters.search) {
                where.OR = [
                    { company: { contains: filters.search } },
                    { clientName: { contains: filters.search } },
                    { mobileNumber: { contains: filters.search } },
                    { email: { contains: filters.search } },
                    { consumerNumber: { contains: filters.search } }
                ];
            }

            const page = filters.page || 1;
            const limit = filters.limit || 50;
            const skip = (page - 1) * limit;

            const [leads, total] = await Promise.all([
                prisma.lead.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limit,
                    include: { assignedTo: { select: { id: true, name: true, email: true } } }
                }),
                prisma.lead.count({ where })
            ]);

            return successResponse({ leads, total, page, totalPages: Math.ceil(total / limit) });
        });

    } catch (error) {
        return handleApiError(error);
    }
});

export const POST = withValidation(LeadSchema)(async (req: ValidatedRequest<typeof LeadSchema._output>) => {
    try {
        // 1. Rate Limiting
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        // 2. Auth
        const session = await getSession();
        logRequest(req, session);

        if (!session) return unauthorizedResponse();

        // Permission check
        const permissionError = await requirePermissions([PERMISSIONS.LEADS_CREATE])(req);
        if (permissionError) return permissionError;

        // 3. Validation - Middleware handled Schema
        const data = req.validatedData;

        // Cross-field Validation
        // Cast data to Partial<Lead> for validation? data is inferred from Zod.
        const crossErrors = validateLeadCrossFields(data as any);
        if (crossErrors.length > 0) {
            return validationErrorResponse(crossErrors);
        }

        // 4. Execution
        return await withTenant(session.tenantId, async () => {
            // Stringify JSON fields
            const leadData: any = { ...data };
            if (data.mobileNumbers) leadData.mobileNumbers = JSON.stringify(data.mobileNumbers);
            if (data.activities) leadData.activities = JSON.stringify(data.activities);
            if (data.customFields) leadData.customFields = JSON.stringify(data.customFields);
            if (data.submitted_payload) leadData.submitted_payload = JSON.stringify(data.submitted_payload);

            const lead = await prisma.lead.create({
                data: {
                    ...leadData,
                    tenantId: session.tenantId,
                    createdById: session.userId,
                    // Default valid enum if missing (zod handles default usually)
                    status: leadData.status || 'NEW',
                }
            });

            // Audit Log
            await prisma.auditLog.create({
                data: {
                    actionType: 'LEAD_CREATED',
                    entityType: 'lead',
                    entityId: lead.id,
                    description: `Lead created: ${lead.company}`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    afterValue: JSON.stringify(lead)
                }
            });

            // Trigger workflows for lead creation
            try {
                await TriggerManager.triggerWorkflows(
                    EntityType.LEAD,
                    lead.id,
                    'CREATE',
                    null,
                    lead as unknown as Record<string, unknown>,
                    session.tenantId,
                    session.userId
                );
            } catch (workflowError) {
                console.error('Failed to trigger workflows for lead creation:', workflowError);
            }

            // WebSocket Broadcast
            try {
                await emitLeadCreated(session.tenantId, lead);
            } catch (wsError) {
                console.error('[WebSocket] Lead creation broadcast failed:', wsError);
            }

            return NextResponse.json({
                success: true,
                message: "Lead created successfully",
                data: lead
            }, { status: 201 });
        });

    } catch (error) {
        return handleApiError(error);
    }
});
