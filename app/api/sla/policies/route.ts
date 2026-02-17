import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSLAPolicy } from '@/lib/validation/workflow-schemas';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * GET /api/sla/policies
 * List SLA policies for tenant
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SLA_VIEW]
    },
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

        return NextResponse.json({ success: true, data: policies });
    }
);

/**
 * POST /api/sla/policies
 * Create a new SLA policy
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SLA_MANAGE]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const body = await req.json();
        const validation = validateSLAPolicy(body);

        if (!validation.success) {
            return validationErrorResponse(
                validation.error.issues.map(e => ({
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

        return NextResponse.json({ success: true, data: policy }, { status: 201 });
    }
);
