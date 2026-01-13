import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { withTenant } from '@/lib/tenant';
import { LeadUpdateSchema, validateRequest } from '@/lib/validation/schemas';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limiter';
import { handleApiError } from '@/lib/middleware/error-handler';
import { successResponse, unauthorizedResponse, notFoundResponse, validationErrorResponse } from '@/lib/api/response-helpers';
import { logRequest } from '@/lib/middleware/request-logger';
import { TriggerManager, EntityType } from '@/lib/workflows/triggers';

// Helper to get params
async function getParams(context: { params: Promise<{ id: string }> }) {
    return await context.params;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await getParams(context);
        const session = await getSession();
        if (!session) return unauthorizedResponse();

        return await withTenant(session.tenantId, async () => {
            const lead = await prisma.lead.findFirst({
                where: { id, tenantId: session.tenantId },
                include: { assignedTo: { select: { id: true, name: true } } }
            });

            if (!lead) return notFoundResponse('Lead');

            // Parse JSON fields
            const parsedLead = {
                ...lead,
                mobileNumbers: lead.mobileNumbers ? JSON.parse(lead.mobileNumbers) : [],
                activities: lead.activities ? JSON.parse(lead.activities) : [],
                customFields: lead.customFields ? JSON.parse(lead.customFields) : {},
                submitted_payload: lead.submitted_payload ? JSON.parse(lead.submitted_payload) : {}
            };

            return successResponse(parsedLead);
        });
    } catch (error) {
        return handleApiError(error);
    }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await getParams(context);
        const rateLimitError = await rateLimitMiddleware(req, 30);
        if (rateLimitError) return rateLimitError;

        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        const body = await req.json();
        const validation = validateRequest(LeadUpdateSchema, body);
        if (!validation.success) return validationErrorResponse(validation.errors!);

        const updates = validation.data!;

        return await withTenant(session.tenantId, async () => {
            const existingLead = await prisma.lead.findFirst({
                where: { id, tenantId: session.tenantId }
            });

            if (!existingLead) return notFoundResponse('Lead');

            // Capture old data for workflow trigger
            const oldData = existingLead as unknown as Record<string, unknown>;

            // Prepare updates
            const data: any = { ...updates };
            if (updates.mobileNumbers) data.mobileNumbers = JSON.stringify(updates.mobileNumbers);
            if (updates.activities) data.activities = JSON.stringify(updates.activities);
            if (updates.customFields) data.customFields = JSON.stringify(updates.customFields);
            if (updates.submitted_payload) data.submitted_payload = JSON.stringify(updates.submitted_payload);

            const lead = await prisma.lead.update({
                where: { id },
                data: {
                    ...data,
                    updatedAt: new Date(),
                    isUpdated: true
                }
            });

            // Audit Log
            await prisma.auditLog.create({
                data: {
                    actionType: 'LEAD_UPDATED',
                    entityType: 'lead',
                    entityId: lead.id,
                    description: `Lead updated: ${lead.company}`,
                    performedById: session.userId,
                    tenantId: session.tenantId,
                    beforeValue: JSON.stringify(existingLead),
                    afterValue: JSON.stringify(lead)
                }
            });

            // Trigger workflows for lead update
            try {
                await TriggerManager.triggerWorkflows(
                    EntityType.LEAD,
                    lead.id,
                    'UPDATE',
                    oldData,
                    lead as unknown as Record<string, unknown>,
                    session.tenantId,
                    session.userId
                );
            } catch (workflowError) {
                console.error('Failed to trigger workflows for lead update:', workflowError);
            }

            return successResponse(lead, "Lead updated successfully");
        });

    } catch (error) {
        return handleApiError(error);
    }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await getParams(context);
        const session = await getSession();
        logRequest(req, session);
        if (!session) return unauthorizedResponse();

        // Only Admin or Manager can delete? Or just soft delete for everyone?
        // Assuming soft delete is standard.

        return await withTenant(session.tenantId, async () => {
            const existingLead = await prisma.lead.findFirst({
                where: { id, tenantId: session.tenantId }
            });

            if (!existingLead) return notFoundResponse('Lead');

            const lead = await prisma.lead.update({
                where: { id },
                data: { isDeleted: true }
            });

            await prisma.auditLog.create({
                data: {
                    actionType: 'LEAD_DELETED',
                    entityType: 'lead',
                    entityId: id,
                    description: 'Lead soft deleted',
                    performedById: session.userId,
                    tenantId: session.tenantId
                }
            });

            return successResponse(null, "Lead deleted successfully");
        });
    } catch (error) {
        return handleApiError(error);
    }
}
