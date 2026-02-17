import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SavedReportSchema, UpdateSavedReportSchema } from '@/lib/validation/report-schemas';
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
 * GET /api/reports/builder
 * Fetch saved reports for current tenant
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
        const includePublic = searchParams.get('includePublic') === 'true';

        const whereClause: any = {
            tenantId: session.tenantId
        };

        // If not including public, only show user's own reports
        if (!includePublic) {
            whereClause.createdById = session.userId;
        } else {
            // Include own reports and public reports
            whereClause.OR = [
                { createdById: session.userId },
                { isPublic: true }
            ];
        }

        const reports = await prisma.savedReport.findMany({
            where: whereClause,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        return NextResponse.json({
            success: true,
            data: { reports }
        });
    }
);

/**
 * POST /api/reports/builder
 * Create a new saved report
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
        const result = SavedReportSchema.safeParse(body);

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

        const report = await prisma.savedReport.create({
            data: {
                name: validatedData.name,
                description: validatedData.description,
                config: JSON.stringify(validatedData.config),
                chartType: validatedData.chartType,
                filters: JSON.stringify(validatedData.config.filters || []),
                groupBy: validatedData.config.groupBy?.fieldKey || null,
                sortBy: validatedData.config.sorts?.[0]?.fieldKey || null,
                isPublic: validatedData.isPublic,
                tenantId: session.tenantId,
                createdById: session.userId
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        return NextResponse.json({
            success: true,
            message: 'Report saved successfully',
            data: { report }
        }, { status: 201 });
    }
);

/**
 * PUT /api/reports/builder
 * Update a saved report
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
        const reportId = searchParams.get('id');

        if (!reportId) {
            return NextResponse.json(
                { success: false, message: 'Report ID is required' },
                { status: 400 }
            );
        }

        // Check ownership
        const existingReport = await prisma.savedReport.findFirst({
            where: {
                id: reportId,
                tenantId: session.tenantId,
                createdById: session.userId
            }
        });

        if (!existingReport) {
            return notFoundResponse('Report');
        }

        const body = await req.json();
        const result = UpdateSavedReportSchema.safeParse(body);

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
        if (validatedData.config) {
            updateData.config = JSON.stringify(validatedData.config);
            updateData.filters = JSON.stringify(validatedData.config.filters || []);
            updateData.groupBy = validatedData.config.groupBy?.fieldKey || null;
            updateData.sortBy = validatedData.config.sorts?.[0]?.fieldKey || null;
        }
        if (validatedData.chartType) updateData.chartType = validatedData.chartType;
        if (validatedData.isPublic !== undefined) updateData.isPublic = validatedData.isPublic;

        const report = await prisma.savedReport.update({
            where: { id: reportId },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        return NextResponse.json({
            success: true,
            message: 'Report updated successfully',
            data: { report }
        });
    }
);

/**
 * DELETE /api/reports/builder
 * Remove a saved report
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
        const reportId = searchParams.get('id');

        if (!reportId) {
            return NextResponse.json(
                { success: false, message: 'Report ID is required' },
                { status: 400 }
            );
        }

        // Check ownership
        const existingReport = await prisma.savedReport.findFirst({
            where: {
                id: reportId,
                tenantId: session.tenantId,
                createdById: session.userId
            }
        });

        if (!existingReport) {
            return notFoundResponse('Report');
        }

        await prisma.savedReport.delete({
            where: { id: reportId }
        });

        return NextResponse.json({
            success: true,
            message: 'Report deleted successfully'
        });
    }
);
