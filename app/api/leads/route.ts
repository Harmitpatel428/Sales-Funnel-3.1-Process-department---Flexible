export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { LeadSchema, LeadFiltersSchema } from '@/lib/validation/schemas';
import { validateLeadCrossFields } from '@/lib/validation/cross-field-rules';
import { formatValidationErrors, validateBypassToken } from '@/lib/middleware/validation';
import { successResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { Prisma } from '@prisma/client';
import { requirePermissions, getRecordLevelFilter } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { emitLeadCreated } from '@/lib/websocket/server';
import { withApiHandler, ApiContext } from '@/lib/api/withApiHandler';

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context: ApiContext) => {
        // Trailing-slash guard
        const { pathname } = new URL(req.url);
        if (pathname.endsWith('/') && pathname !== '/api/leads/' && pathname !== '/api/cases/') {
            // Do nothing
        }

        // Parse URL for query params
        const url = new URL(req.url);
        const session = context.session!;

        // Parse and validate query parameters
        const queryData: Record<string, any> = {};
        url.searchParams.forEach((value, key) => {
            if (queryData[key]) {
                queryData[key] = Array.isArray(queryData[key])
                    ? [...queryData[key], value]
                    : [queryData[key], value];
            } else {
                queryData[key] = value;
            }
        });

        const validationResult = LeadFiltersSchema.safeParse(queryData);
        if (!validationResult.success) {
            const formatted = formatValidationErrors(validationResult.error);
            return NextResponse.json(formatted, { status: 400 });
        }
        const filters = validationResult.data;

        // Check for validation bypass token
        const bypassToken = req.headers.get('X-Validation-Bypass-Token');
        if (bypassToken) {
            const { valid } = await validateBypassToken(bypassToken);
            if (valid) {
                console.log('[Validation Bypass] GET /api/leads - bypass token accepted');
            }
        }

        // Permission check
        const permissionError = await requirePermissions(
            [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED, PERMISSIONS.LEADS_VIEW_ALL],
            false // require any
        )(req);

        if (permissionError) return permissionError;

        // Get record-level filter
        const recordFilter = await getRecordLevelFilter(session.userId, 'leads', 'view');

        // Execution
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
    }
);

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 30 },
    async (req: NextRequest, context: ApiContext) => {
        // Trailing-slash guard
        const { pathname } = new URL(req.url);
        if (pathname.endsWith('/') && pathname !== '/api/leads/' && pathname !== '/api/cases/') {
            // Do nothing
        }

        const session = context.session!;

        // Parse and validate request body
        let body: unknown;
        try {
            const clone = req.clone();
            body = await clone.json();
        } catch (e) {
            return NextResponse.json(
                { success: false, error: 'INVALID_JSON_BODY', message: 'Invalid JSON in request body' },
                { status: 400 }
            );
        }

        // Check for validation bypass token
        const bypassToken = req.headers.get('X-Validation-Bypass-Token');
        let skipValidation = false;
        if (bypassToken) {
            const { valid, logId } = await validateBypassToken(bypassToken);
            if (valid && logId) {
                console.log('[Validation Bypass] POST /api/leads - bypass token accepted');
                skipValidation = true;
                // Mark token as used
                try {
                    await prisma.validationBypassLog.update({
                        where: { id: logId },
                        data: { usedAt: new Date() }
                    });
                } catch (err) {
                    console.error('[Validation] Failed to mark bypass token as used:', err);
                }
            }
        }

        let data: any;
        if (skipValidation) {
            // Bypass validation - use raw body
            data = body;
        } else {
            const validationResult = LeadSchema.safeParse(body);
            if (!validationResult.success) {
                const formatted = formatValidationErrors(validationResult.error);
                return NextResponse.json(formatted, { status: 400 });
            }
            data = validationResult.data;
        }

        // Permission check
        const permissionError = await requirePermissions([PERMISSIONS.LEADS_CREATE])(req);
        if (permissionError) return permissionError;

        // Cross-field Validation
        const crossErrors = validateLeadCrossFields(data as any);
        if (crossErrors.length > 0) {
            return validationErrorResponse(crossErrors);
        }

        // Execution
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
                    // Default valid enum if missing
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
    }
);
