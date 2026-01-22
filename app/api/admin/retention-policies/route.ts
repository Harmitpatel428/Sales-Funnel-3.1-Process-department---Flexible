/**
 * Retention Policy Admin API
 * GET /api/admin/retention-policies - List policies
 * POST /api/admin/retention-policies - Create/Update policy
 * DELETE /api/admin/retention-policies - Delete policy
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    forbiddenResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

const RetentionPolicySchema = z.object({
    documentType: z.string().min(1),
    retentionPeriod: z.number().int().min(1),
    retentionUnit: z.enum(['DAYS', 'MONTHS', 'YEARS', 'PERMANENT']),
    autoDelete: z.boolean().default(false),
});

/**
 * GET /api/admin/retention-policies
 * List policies (ADMIN only, uses NextAuth)
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, useNextAuth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { nextAuthSession } = context;

        if (!nextAuthSession?.user?.id) {
            return unauthorizedResponse();
        }

        const user = await prisma.user.findUnique({
            where: { id: nextAuthSession.user.id },
            select: { role: true, tenantId: true }
        });

        if (!user || user.role !== 'ADMIN') {
            return forbiddenResponse('Admin access required');
        }

        const policies = await prisma.retentionPolicy.findMany({
            where: { tenantId: user.tenantId },
            orderBy: { documentType: 'asc' }
        });

        return NextResponse.json({ policies });
    }
);

/**
 * POST /api/admin/retention-policies
 * Create/Update policy (ADMIN only, uses NextAuth)
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, useNextAuth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { nextAuthSession } = context;

        if (!nextAuthSession?.user?.id) {
            return unauthorizedResponse();
        }

        const user = await prisma.user.findUnique({
            where: { id: nextAuthSession.user.id },
            select: { role: true, tenantId: true }
        });

        if (!user || user.role !== 'ADMIN') {
            return forbiddenResponse('Admin access required');
        }

        const body = await req.json();
        const result = RetentionPolicySchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(
                result.error.errors.map(e => ({
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
                    tenantId: user.tenantId,
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
                tenantId: user.tenantId,
                documentType: data.documentType,
                retentionPeriod: data.retentionPeriod,
                retentionUnit: data.retentionUnit,
                autoDelete: data.autoDelete,
                createdById: nextAuthSession.user.id
            }
        });

        return NextResponse.json({ policy });
    }
);

/**
 * DELETE /api/admin/retention-policies
 * Delete policy (ADMIN only, uses NextAuth)
 */
export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, useNextAuth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { nextAuthSession } = context;

        if (!nextAuthSession?.user?.id) {
            return unauthorizedResponse();
        }

        const user = await prisma.user.findUnique({
            where: { id: nextAuthSession.user.id },
            select: { role: true, tenantId: true }
        });

        if (!user || user.role !== 'ADMIN') {
            return forbiddenResponse('Admin access required');
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
                    tenantId: user.tenantId,
                    documentType
                }
            }
        });

        return NextResponse.json({ success: true });
    }
);
