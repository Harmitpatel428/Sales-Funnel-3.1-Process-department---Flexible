import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiKeyAuth, ApiKeyAuthResult } from '@/lib/middleware/api-key-auth';
import { WebhookManager } from '@/lib/webhooks/manager';
import { z } from 'zod';

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

// GET /api/v1/leads/[id] - Get single lead
async function handleGet(
    req: NextRequest,
    auth: ApiKeyAuthResult,
    params: { id: string }
): Promise<NextResponse> {
    const lead = await prisma.lead.findFirst({
        where: {
            id: params.id,
            tenantId: auth.tenant.id,
            isDeleted: false,
        },
        include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            cases: { select: { caseId: true, caseNumber: true, processStatus: true } },
        },
    });

    if (!lead) {
        return NextResponse.json(
            { success: false, error: { code: 'NOT_FOUND', message: 'Lead not found' } },
            { status: 404 }
        );
    }

    return NextResponse.json({ success: true, data: lead });
}

// PUT /api/v1/leads/[id] - Update lead
async function handlePut(
    req: NextRequest,
    auth: ApiKeyAuthResult,
    params: { id: string }
): Promise<NextResponse> {
    const existing = await prisma.lead.findFirst({
        where: { id: params.id, tenantId: auth.tenant.id, isDeleted: false },
    });

    if (!existing) {
        return NextResponse.json(
            { success: false, error: { code: 'NOT_FOUND', message: 'Lead not found' } },
            { status: 404 }
        );
    }

    const body = await req.json();
    const parsed = updateLeadSchema.safeParse(body);

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
    const previousStatus = existing.status;

    const lead = await prisma.lead.update({
        where: { id: params.id },
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
    WebhookManager.triggerWebhooks(auth.tenant.id, 'lead.updated', {
        lead,
        previousValues: { status: previousStatus },
        updatedBy: { type: 'api_key', id: auth.apiKey.id, name: auth.apiKey.name },
        timestamp: new Date().toISOString(),
    }).catch(console.error);

    // Status change specific webhook
    if (data.status && data.status !== previousStatus) {
        WebhookManager.triggerWebhooks(auth.tenant.id, 'lead.status_changed', {
            lead,
            previousStatus,
            newStatus: data.status,
            timestamp: new Date().toISOString(),
        }).catch(console.error);
    }

    return NextResponse.json({ success: true, data: lead });
}

// DELETE /api/v1/leads/[id] - Delete lead
async function handleDelete(
    req: NextRequest,
    auth: ApiKeyAuthResult,
    params: { id: string }
): Promise<NextResponse> {
    const existing = await prisma.lead.findFirst({
        where: { id: params.id, tenantId: auth.tenant.id, isDeleted: false },
    });

    if (!existing) {
        return NextResponse.json(
            { success: false, error: { code: 'NOT_FOUND', message: 'Lead not found' } },
            { status: 404 }
        );
    }

    // Soft delete
    await prisma.lead.update({
        where: { id: params.id },
        data: { isDeleted: true },
    });

    // Trigger webhook
    WebhookManager.triggerWebhooks(auth.tenant.id, 'lead.deleted', {
        leadId: params.id,
        deletedBy: { type: 'api_key', id: auth.apiKey.id, name: auth.apiKey.name },
        timestamp: new Date().toISOString(),
    }).catch(console.error);

    return NextResponse.json({ success: true, message: 'Lead deleted successfully' });
}

// Wrap handlers with API key auth
export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    return withApiKeyAuth(
        (req, auth) => handleGet(req, auth, params),
        ['leads:read']
    )(req);
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    return withApiKeyAuth(
        (req, auth) => handlePut(req, auth, params),
        ['leads:write']
    )(req);
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    return withApiKeyAuth(
        (req, auth) => handleDelete(req, auth, params),
        ['leads:delete']
    )(req);
}
