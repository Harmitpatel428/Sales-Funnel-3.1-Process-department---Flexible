import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiKeyAuth, ApiKeyAuthResult } from '@/lib/middleware/api-key-auth';
import { WebhookManager } from '@/lib/webhooks/manager';
import { z } from 'zod';

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

// GET /api/v1/cases - List cases
async function handleGet(req: NextRequest, auth: ApiKeyAuthResult): Promise<NextResponse> {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const leadId = searchParams.get('leadId');

    const where: any = { tenantId: auth.tenant.id };

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

// POST /api/v1/cases - Create case
async function handlePost(req: NextRequest, auth: ApiKeyAuthResult): Promise<NextResponse> {
    const body = await req.json();
    const parsed = createCaseSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid request data',
                    details: parsed.error.flatten().fieldErrors,
                },
            },
            { status: 400 }
        );
    }

    const data = parsed.data;

    // Verify lead exists and belongs to tenant
    const lead = await prisma.lead.findFirst({
        where: { id: data.leadId, tenantId: auth.tenant.id, isDeleted: false },
    });

    if (!lead) {
        return NextResponse.json(
            { success: false, error: { code: 'NOT_FOUND', message: 'Lead not found' } },
            { status: 404 }
        );
    }

    // Generate case number
    const caseCount = await prisma.case.count({ where: { tenantId: auth.tenant.id } });
    const caseNumber = `CASE-${String(caseCount + 1).padStart(6, '0')}`;

    const newCase = await prisma.case.create({
        data: {
            leadId: data.leadId,
            tenantId: auth.tenant.id,
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
            createdById: auth.apiKey.userId,
        },
        include: {
            lead: { select: { id: true, clientName: true, company: true, email: true } },
        },
    });

    // Trigger webhook
    WebhookManager.triggerWebhooks(auth.tenant.id, 'case.created', {
        case: newCase,
        lead: { id: lead.id, clientName: lead.clientName, company: lead.company },
        createdBy: { type: 'api_key', id: auth.apiKey.id, name: auth.apiKey.name },
        timestamp: new Date().toISOString(),
    }).catch(console.error);

    return NextResponse.json(
        { success: true, data: newCase },
        { status: 201 }
    );
}

export const GET = withApiKeyAuth(handleGet, ['cases:read']);
export const POST = withApiKeyAuth(handlePost, ['cases:write']);
