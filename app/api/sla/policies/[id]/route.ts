/**
 * Individual SLA Policy API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSLAPolicy } from '@/lib/validation/workflow-schemas';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/sla/policies/[id]
 * Get a specific SLA policy
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const policy = await prisma.sLAPolicy.findFirst({
            where: { id, tenantId: session.tenantId },
            include: {
                createdBy: { select: { id: true, name: true } },
                escalationWorkflow: { select: { id: true, name: true } }
            }
        });

        if (!policy) {
            return notFoundResponse('Policy');
        }

        return NextResponse.json(policy);
    }
);

/**
 * PUT /api/sla/policies/[id]
 * Update an SLA policy
 */
export const PUT = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const existing = await prisma.sLAPolicy.findFirst({
            where: { id, tenantId: session.tenantId }
        });

        if (!existing) {
            return notFoundResponse('Policy');
        }

        const body = await req.json();
        const validation = validateSLAPolicy(body);

        if (!validation.success) {
            return validationErrorResponse(
                validation.error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                    code: e.code
                }))
            );
        }

        const policy = await prisma.sLAPolicy.update({
            where: { id },
            data: validation.data
        });

        return NextResponse.json(policy);
    }
);

/**
 * DELETE /api/sla/policies/[id]
 * Delete an SLA policy
 */
export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const existing = await prisma.sLAPolicy.findFirst({
            where: { id, tenantId: session.tenantId }
        });

        if (!existing) {
            return notFoundResponse('Policy');
        }

        await prisma.sLAPolicy.delete({ where: { id } });

        return NextResponse.json({ success: true });
    }
);
