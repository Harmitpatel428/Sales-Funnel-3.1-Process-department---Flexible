/**
 * SLA Policies API Routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSLAPolicy } from '@/lib/validation/workflow-schemas';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/sla/policies
 * List SLA policies for tenant
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const policies = await prisma.sLAPolicy.findMany({
            where: { tenantId: session.tenantId },
            include: {
                createdBy: { select: { id: true, name: true } },
                escalationWorkflow: { select: { id: true, name: true } },
                _count: { select: { trackers: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ policies });
    }
);

/**
 * POST /api/sla/policies
 * Create a new SLA policy
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
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

        const policy = await prisma.sLAPolicy.create({
            data: {
                tenantId: session.tenantId,
                createdById: session.userId,
                ...validation.data
            }
        });

        return NextResponse.json(policy, { status: 201 });
    }
);
