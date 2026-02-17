export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenant } from '@/lib/tenant';
import { CaseSchema, CaseFiltersSchema } from '@/lib/validation/schemas';
import { validateCaseCrossFields } from '@/lib/validation/cross-field-rules';
import { formatValidationErrors, validateBypassToken } from '@/lib/middleware/validation';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { Prisma } from '@prisma/client';
import { getRecordLevelFilter } from '@/lib/middleware/permissions';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';
import { emitCaseCreated } from '@/lib/websocket/server';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';
import { PERMISSIONS } from '@/app/types/permissions';

const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    // session check removed (handled by wrapper)

    const { searchParams } = new URL(req.url);
    const queryData: Record<string, any> = {};
    searchParams.forEach((value, key) => {
        if (queryData[key]) {
            queryData[key] = Array.isArray(queryData[key])
                ? [...queryData[key], value]
                : [queryData[key], value];
        } else {
            queryData[key] = value;
        }
    });

    const validationResult = CaseFiltersSchema.safeParse(queryData);
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
            console.log('[Validation Bypass] GET /api/cases - bypass token accepted');
        }
    }

    // Get record-level filter
    const recordFilter = await getRecordLevelFilter(session!.userId, 'cases', 'view');

    // Execution
    return await withTenant(session!.tenantId, async () => {
        const where: Prisma.CaseWhereInput = {
            tenantId: session!.tenantId,
            ...recordFilter, // Apply record-level permissions
        };

        // Role-based visibility - handled by recordFilter mostly, but keeping specific logic for PROCESS_EXECUTIVE 
        // if it's not fully covered by recordFilter. 
        // The plan says: remove Lines 63-65 (Role-based visibility check for PROCESS_EXECUTIVE)

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
};

const postHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    // session check removed

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

    const validationResult = CaseSchema.safeParse(body);
    if (!validationResult.success) {
        const formatted = formatValidationErrors(validationResult.error);
        return NextResponse.json(formatted, { status: 400 });
    }
    const data = validationResult.data;

    // Check for validation bypass token
    const bypassTokenPost = req.headers.get('X-Validation-Bypass-Token');
    if (bypassTokenPost) {
        const { valid, logId } = await validateBypassToken(bypassTokenPost);
        if (valid && logId) {
            console.log('[Validation Bypass] POST /api/cases - bypass token accepted');
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

    // Role-based permission check removed (handled by declarative permissions)

    // Cross-field Validation
    const crossErrors = validateCaseCrossFields(data as any);
    if (crossErrors.length > 0) {
        return validationErrorResponse(crossErrors);
    }

    // Execution
    return await withTenant(session!.tenantId, async () => {
        // Stringify JSON fields
        const caseData: any = { ...data };
        if (data.benefitTypes) caseData.benefitTypes = JSON.stringify(data.benefitTypes);
        if (data.contacts) caseData.contacts = JSON.stringify(data.contacts);
        if (data.originalLeadData) caseData.originalLeadData = JSON.stringify(data.originalLeadData);

        const newCase = await prisma.case.create({
            data: {
                ...caseData,
                tenantId: session!.tenantId,
            }
        });

        await prisma.auditLog.create({
            data: {
                actionType: 'CASE_CREATED',
                entityType: 'case',
                entityId: newCase.caseId,
                description: `Case created manually: ${newCase.caseNumber}`,
                performedById: session!.userId,
                tenantId: session!.tenantId,
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
                session!.tenantId,
                session!.userId
            );
        } catch (workflowError) {
            console.error('Failed to trigger workflows for case creation:', workflowError);
        }

        // WebSocket Broadcast
        try {
            await emitCaseCreated(session!.tenantId, newCase);
        } catch (wsError) {
            console.error('[WebSocket] Case creation broadcast failed:', wsError);
        }

        return successResponse(newCase, "Case created successfully");
    });
};

export const GET = withApiHandler({
    authRequired: true,
    checkDbHealth: true,
    rateLimit: 100,
    permissions: [PERMISSIONS.CASES_VIEW_OWN, PERMISSIONS.CASES_VIEW_ASSIGNED, PERMISSIONS.CASES_VIEW_ALL],
    requireAll: false
}, getHandler);

export const POST = withApiHandler({
    authRequired: true,
    checkDbHealth: true,
    rateLimit: 30,
    permissions: [PERMISSIONS.CASES_CREATE]
}, postHandler);
