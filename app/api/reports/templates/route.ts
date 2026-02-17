import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ReportTemplateSchema, UpdateReportTemplateSchema } from '@/lib/validation/report-schemas';
import { z } from 'zod';
import { PERMISSIONS } from '@/app/types/permissions';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/reports/templates
 * List report templates
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.REPORTS_VIEW_OWN, PERMISSIONS.REPORTS_VIEW_ALL],
        requireAll: false
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const category = searchParams.get('category');

        const templates = await prisma.reportTemplate.findMany({
            where: {
                tenantId: session.tenantId,
                OR: [
                    { createdById: session.userId },
                    { isPublic: true }
                ],
                ...(category ? { category } : {})
            },
            include: { createdBy: { select: { id: true, name: true } } },
            orderBy: { updatedAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: { templates } });
    }
);

/**
 * POST /api/reports/templates
 * Create a new report template
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.REPORTS_CREATE]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const body = await req.json();
        const result = ReportTemplateSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(
                result.error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                    code: e.code
                }))
            );
        }

        const validatedData = result.data;

        const template = await prisma.reportTemplate.create({
            data: {
                name: validatedData.name,
                description: validatedData.description,
                config: JSON.stringify(validatedData.config),
                category: validatedData.category,
                isPublic: validatedData.isPublic,
                sharedWith: JSON.stringify(validatedData.sharedWith),
                tenantId: session.tenantId,
                createdById: session.userId
            }
        });

        return NextResponse.json({ success: true, message: 'Template created', data: { template } }, { status: 201 });
    }
);

/**
 * PUT /api/reports/templates
 * Update a report template
 */
export const PUT = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.REPORTS_EDIT]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const templateId = searchParams.get('id');
        if (!templateId) {
            return NextResponse.json({ success: false, message: 'Template ID required' }, { status: 400 });
        }

        const existing = await prisma.reportTemplate.findFirst({
            where: { id: templateId, tenantId: session.tenantId, createdById: session.userId }
        });
        if (!existing) {
            return notFoundResponse('Template');
        }

        const body = await req.json();
        const result = UpdateReportTemplateSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(
                result.error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                    code: e.code
                }))
            );
        }

        const validatedData = result.data;
        const updateData: any = {};
        if (validatedData.name) updateData.name = validatedData.name;
        if (validatedData.description !== undefined) updateData.description = validatedData.description;
        if (validatedData.config) updateData.config = JSON.stringify(validatedData.config);
        if (validatedData.category) updateData.category = validatedData.category;
        if (validatedData.isPublic !== undefined) updateData.isPublic = validatedData.isPublic;
        if (validatedData.sharedWith) updateData.sharedWith = JSON.stringify(validatedData.sharedWith);

        const template = await prisma.reportTemplate.update({ where: { id: templateId }, data: updateData });
        return NextResponse.json({ success: true, message: 'Template updated', data: { template } });
    }
);

/**
 * DELETE /api/reports/templates
 * Delete a report template
 */
export const DELETE = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.REPORTS_DELETE]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const templateId = searchParams.get('id');
        if (!templateId) {
            return NextResponse.json({ success: false, message: 'Template ID required' }, { status: 400 });
        }

        const existing = await prisma.reportTemplate.findFirst({
            where: { id: templateId, tenantId: session.tenantId, createdById: session.userId }
        });
        if (!existing) {
            return notFoundResponse('Template');
        }

        await prisma.reportTemplate.delete({ where: { id: templateId } });
        return NextResponse.json({ success: true, message: 'Template deleted' });
    }
);
