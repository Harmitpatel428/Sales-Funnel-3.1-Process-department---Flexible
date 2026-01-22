import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { WebhookManager } from '@/lib/webhooks/manager';
import { z } from 'zod';
import {
    withApiHandler,
    ApiContext,
    notFoundResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

// Case validation schema
const createCaseSchema = z.object({
    leadId: z.string().min(1, 'Lead ID is required'),
    schemeType: z.string().optional(),
    caseType: z.string().optional(),
    benefitTypes: z.array(z.string()).optional(),
    processStatus: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'ON_HOLD']).default('PENDING'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    notes: z.string().optional(),
});

/**
 * GET /api/v1/cases
 * List cases - Public API using API key auth
 */
export const GET = withApiHandler(
    { useApiKeyAuth: true, requiredScopes: ['cases:read'], checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { apiKeyAuth } = context;

        if (!apiKeyAuth) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
        const status = searchParams.get('status');
        const priority = searchParams.get('priority');
        const leadId = searchParams.get('leadId');

        const where: any = { tenantId: apiKeyAuth.tenant.id };

        if (status) where.processStatus = status;
        if (priority) where.priority = priority;
        if (leadId) where.leadId = leadId;

        const [cases, total] = await Promise.all([
            prisma.case.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    lead: { select: { id: true, clientName: true, company: true, email: true } },
                    assignedTo: { select: { id: true, name: true, email: true } },
                },
            }),
            prisma.case.count({ where }),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                cases,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });
    }
);

/**
 * POST /api/v1/cases
 * Create case - Public API using API key auth
 */
export const POST = withApiHandler(
    { useApiKeyAuth: true, requiredScopes: ['cases:write'], checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { apiKeyAuth } = context;

        if (!apiKeyAuth) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const parsed = createCaseSchema.safeParse(body);

        if (!parsed.success) {
            return validationErrorResponse(
                parsed.error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                    code: e.code
                }))
            );
        }

        const data = parsed.data;

        // Verify lead exists and belongs to tenant
        const lead = await prisma.lead.findFirst({
            where: { id: data.leadId, tenantId: apiKeyAuth.tenant.id, isDeleted: false },
        });

        if (!lead) {
            return notFoundResponse('Lead');
        }

        // Generate case number
        const caseCount = await prisma.case.count({ where: { tenantId: apiKeyAuth.tenant.id } });
        const caseNumber = `CASE-${String(caseCount + 1).padStart(6, '0')}`;

        const newCase = await prisma.case.create({
            data: {
                leadId: data.leadId,
                tenantId: apiKeyAuth.tenant.id,
                caseNumber,
                schemeType: data.schemeType,
                caseType: data.caseType,
                benefitTypes: data.benefitTypes || [],
                processStatus: data.processStatus,
                priority: data.priority,
                clientName: lead.clientName,
                company: lead.company,
                mobileNumber: lead.mobileNumber,
                consumerNumber: lead.consumerNumber,
                kva: lead.kva,
                createdById: apiKeyAuth.apiKey.userId,
            },
            include: {
                lead: { select: { id: true, clientName: true, company: true, email: true } },
            },
        });

        // Trigger webhook
        WebhookManager.triggerWebhooks(apiKeyAuth.tenant.id, 'case.created', {
            case: newCase,
            lead: { id: lead.id, clientName: lead.clientName, company: lead.company },
            createdBy: { type: 'api_key', id: apiKeyAuth.apiKey.id, name: apiKeyAuth.apiKey.name },
            timestamp: new Date().toISOString(),
        }).catch(console.error);

        return NextResponse.json(
            { success: true, data: newCase },
            { status: 201 }
        );
    }
);
