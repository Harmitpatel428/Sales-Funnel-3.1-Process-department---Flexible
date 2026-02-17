import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

const RetentionPolicySchema = z.object({
    documentType: z.string().min(1),
    retentionPeriod: z.number().int().min(1),
    retentionUnit: z.enum(['DAYS', 'MONTHS', 'YEARS', 'PERMANENT']),
    autoDelete: z.boolean().default(false),
});

/**
 * Helper to ensure tenantId is resolved
 */
async function resolveTenantId(session: { userId: string, tenantId?: string }): Promise<string | null> {
    if (session.tenantId) return session.tenantId;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { tenantId: true }
    });

    return user?.tenantId || null;
}

/**
 * GET /api/admin/retention-policies
 * List policies (ADMIN only, uses NextAuth)
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_EDIT]
    },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session?.userId) {
            return unauthorizedResponse();
        }

        const tenantId = await resolveTenantId(session);
        if (!tenantId) {
            return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Tenant context could not be resolved' }, { status: 403 });
        }

        const policies = await prisma.retentionPolicy.findMany({
            where: { tenantId },
            orderBy: { documentType: 'asc' }
        });

        return NextResponse.json({ success: true, data: policies });
    }
);

/**
 * POST /api/admin/retention-policies
 * Create/Update policy (ADMIN only, uses NextAuth)
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_EDIT]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session?.userId) {
            return unauthorizedResponse();
        }

        const tenantId = await resolveTenantId(session);
        if (!tenantId) {
            return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Tenant context could not be resolved' }, { status: 403 });
        }

        const body = await req.json();
        const result = RetentionPolicySchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(
                result.error.issues.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                    code: e.code
                }))
            );
        }

        const data = result.data;

        // Upsert policy
        const policy = await prisma.retentionPolicy.upsert({
            where: {
                tenantId_documentType: {
                    tenantId,
                    documentType: data.documentType
                }
            },
            update: {
                retentionPeriod: data.retentionPeriod,
                retentionUnit: data.retentionUnit,
                autoDelete: data.autoDelete,
                updatedAt: new Date()
            },
            create: {
                tenantId,
                documentType: data.documentType,
                retentionPeriod: data.retentionPeriod,
                retentionUnit: data.retentionUnit,
                autoDelete: data.autoDelete,
                createdById: session.userId
            }
        });

        return NextResponse.json({ success: true, data: policy });
    }
);

/**
 * DELETE /api/admin/retention-policies
 * Delete policy (ADMIN only, uses NextAuth)
 */
export const DELETE = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_EDIT]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session?.userId) {
            return unauthorizedResponse();
        }

        const tenantId = await resolveTenantId(session);
        if (!tenantId) {
            return NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Tenant context could not be resolved' }, { status: 403 });
        }

        const searchParams = req.nextUrl.searchParams;
        const documentType = searchParams.get('documentType');

        if (!documentType) {
            return validationErrorResponse([
                { field: 'documentType', message: 'Document type is required', code: 'required' }
            ]);
        }

        await prisma.retentionPolicy.delete({
            where: {
                tenantId_documentType: {
                    tenantId,
                    documentType
                }
            }
        });

        return NextResponse.json({ success: true });
    }
);
