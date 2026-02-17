import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { WebhookManager } from '@/lib/webhooks/manager';
import { z } from 'zod';
import {
    withApiHandler,
    ApiContext,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

// Lead validation schema
const createLeadSchema = z.object({
    clientName: z.string().min(1, 'Client name is required'),
    email: z.string().email().optional(),
    mobileNumber: z.string().optional(),
    company: z.string().optional(),
    source: z.string().optional(),
    status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']).default('NEW'),
    notes: z.string().optional(),
    kva: z.string().optional(),
    consumerNumber: z.string().optional(),
    discom: z.string().optional(),
    gidc: z.string().optional(),
    gstNumber: z.string().optional(),
    companyLocation: z.string().optional(),
    unitType: z.string().optional(),
    marketingObjective: z.string().optional(),
    budget: z.string().optional(),
    termLoan: z.string().optional(),
    timeline: z.string().optional(),
    contactOwner: z.string().optional(),
    customFields: z.record(z.any()).optional(),
});

/**
 * GET /api/v1/leads
 * List leads - Public API endpoint using API key auth
 * 
 * NOTE: v1 API routes use API key authentication with scope-based permissions.
 * They do NOT use session-based declarative permissions like internal routes.
 * - requiredScopes: ['leads:read'] maps to LEADS_VIEW_ALL permission
 * - Tenant isolation is enforced via apiKeyAuth.tenant.id
 */
export const GET = withApiHandler(
    { useApiKeyAuth: true, requiredScopes: ['leads:read'], checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { apiKeyAuth } = context;

        if (!apiKeyAuth) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
        const status = searchParams.get('status');
        const search = searchParams.get('search');
        const assignedToId = searchParams.get('assignedToId');
        const source = searchParams.get('source');

        const where: any = {
            tenantId: apiKeyAuth.tenant.id,
            isDeleted: false,
        };

        if (status) where.status = status;
        if (assignedToId) where.assignedToId = assignedToId;
        if (source) where.source = source;
        if (search) {
            where.OR = [
                { clientName: { contains: search } },
                { email: { contains: search } },
                { company: { contains: search } },
                { mobileNumber: { contains: search } },
            ];
        }

        const [leads, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    assignedTo: { select: { id: true, name: true, email: true } },
                },
            }),
            prisma.lead.count({ where }),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                leads,
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
 * POST /api/v1/leads
 * Create lead - Public API endpoint using API key auth
 * 
 * NOTE: v1 API routes use API key authentication with scope-based permissions.
 * They do NOT use session-based declarative permissions like internal routes.
 * - requiredScopes: ['leads:write'] maps to LEADS_CREATE permission
 * - Tenant isolation is enforced via apiKeyAuth.tenant.id
 */
export const POST = withApiHandler(
    { useApiKeyAuth: true, requiredScopes: ['leads:write'], checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { apiKeyAuth } = context;

        if (!apiKeyAuth) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const parsed = createLeadSchema.safeParse(body);

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

        const lead = await prisma.lead.create({
            data: {
                clientName: data.clientName,
                email: data.email,
                mobileNumber: data.mobileNumber,
                company: data.company,
                source: data.source,
                status: data.status,
                notes: data.notes,
                kva: data.kva,
                consumerNumber: data.consumerNumber,
                discom: data.discom,
                gidc: data.gidc,
                gstNumber: data.gstNumber,
                companyLocation: data.companyLocation,
                unitType: data.unitType,
                marketingObjective: data.marketingObjective,
                budget: data.budget,
                termLoan: data.termLoan,
                timeline: data.timeline,
                contactOwner: data.contactOwner,
                customFields: data.customFields ? JSON.stringify(data.customFields) : '{}',
                tenantId: apiKeyAuth.tenant.id,
                createdById: apiKeyAuth.apiKey.userId,
            },
            include: {
                assignedTo: { select: { id: true, name: true, email: true } },
            },
        });

        // Trigger webhook
        WebhookManager.triggerWebhooks(apiKeyAuth.tenant.id, 'lead.created', {
            lead,
            createdBy: { type: 'api_key', id: apiKeyAuth.apiKey.id, name: apiKeyAuth.apiKey.name },
            timestamp: new Date().toISOString(),
        }).catch(console.error);

        return NextResponse.json(
            { success: true, data: lead },
            { status: 201 }
        );
    }
);
