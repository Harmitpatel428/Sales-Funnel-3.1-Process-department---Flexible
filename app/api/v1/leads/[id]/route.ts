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

const updateLeadSchema = z.object({
    clientName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    mobileNumber: z.string().optional(),
    company: z.string().optional(),
    source: z.string().optional(),
    status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']).optional(),
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
    assignedToId: z.string().optional(),
    customFields: z.record(z.any()).optional(),
});

/**
 * GET /api/v1/leads/[id]
 * Get single lead - Public API using API key auth
 */
export const GET = withApiHandler(
    { useApiKeyAuth: true, requiredScopes: ['leads:read'], checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { apiKeyAuth, params } = context;

        if (!apiKeyAuth) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const lead = await prisma.lead.findFirst({
            where: {
                id,
                tenantId: apiKeyAuth.tenant.id,
                isDeleted: false,
            },
            include: {
                assignedTo: { select: { id: true, name: true, email: true } },
                cases: { select: { caseId: true, caseNumber: true, processStatus: true } },
            },
        });

        if (!lead) {
            return notFoundResponse('Lead');
        }

        return NextResponse.json({ success: true, data: lead });
    }
);

/**
 * PUT /api/v1/leads/[id]
 * Update lead - Public API using API key auth
 */
export const PUT = withApiHandler(
    { useApiKeyAuth: true, requiredScopes: ['leads:write'], checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { apiKeyAuth, params } = context;

        if (!apiKeyAuth) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const existing = await prisma.lead.findFirst({
            where: { id, tenantId: apiKeyAuth.tenant.id, isDeleted: false },
        });

        if (!existing) {
            return notFoundResponse('Lead');
        }

        const body = await req.json();
        const parsed = updateLeadSchema.safeParse(body);

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
        const previousStatus = existing.status;

        const lead = await prisma.lead.update({
            where: { id },
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
                assignedToId: data.assignedToId,
                customFields: data.customFields ? JSON.stringify(data.customFields) : undefined,
            },
            include: {
                assignedTo: { select: { id: true, name: true, email: true } },
            },
        });

        // Trigger webhooks
        WebhookManager.triggerWebhooks(apiKeyAuth.tenant.id, 'lead.updated', {
            lead,
            previousValues: { status: previousStatus },
            updatedBy: { type: 'api_key', id: apiKeyAuth.apiKey.id, name: apiKeyAuth.apiKey.name },
            timestamp: new Date().toISOString(),
        }).catch(console.error);

        // Status change specific webhook
        if (data.status && data.status !== previousStatus) {
            WebhookManager.triggerWebhooks(apiKeyAuth.tenant.id, 'lead.status_changed', {
                lead,
                previousStatus,
                newStatus: data.status,
                timestamp: new Date().toISOString(),
            }).catch(console.error);
        }

        return NextResponse.json({ success: true, data: lead });
    }
);

/**
 * DELETE /api/v1/leads/[id]
 * Delete lead - Public API using API key auth
 */
export const DELETE = withApiHandler(
    { useApiKeyAuth: true, requiredScopes: ['leads:delete'], checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { apiKeyAuth, params } = context;

        if (!apiKeyAuth) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        const existing = await prisma.lead.findFirst({
            where: { id, tenantId: apiKeyAuth.tenant.id, isDeleted: false },
        });

        if (!existing) {
            return notFoundResponse('Lead');
        }

        // Soft delete
        await prisma.lead.update({
            where: { id },
            data: { isDeleted: true },
        });

        // Trigger webhook
        WebhookManager.triggerWebhooks(apiKeyAuth.tenant.id, 'lead.deleted', {
            leadId: id,
            deletedBy: { type: 'api_key', id: apiKeyAuth.apiKey.id, name: apiKeyAuth.apiKey.name },
            timestamp: new Date().toISOString(),
        }).catch(console.error);

        return NextResponse.json({ success: true, message: 'Lead deleted successfully' });
    }
);
