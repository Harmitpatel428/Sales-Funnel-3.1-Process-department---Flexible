import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ScheduledReportSchema, UpdateScheduledReportSchema } from '@/lib/validation/report-schemas';
import { z } from 'zod';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

// Simple cron expression validation
function isValidCron(expression: string): boolean {
    // Basic validation: 5 or 6 space-separated fields
    const parts = expression.trim().split(/\s+/);
    return parts.length >= 5 && parts.length <= 6;
}

// Calculate next run time from cron expression (simplified)
function calculateNextRun(cron: string): Date {
    // Simplified: just set next run to tomorrow at 9 AM
    // In production, use a proper cron parser library
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
}

/**
 * GET /api/reports/schedule
 * Fetch scheduled reports for current tenant
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const scheduledReports = await prisma.scheduledReport.findMany({
            where: {
                tenantId: session.tenantId
            },
            include: {
                report: {
                    select: { id: true, name: true, chartType: true }
                },
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { nextRunAt: 'asc' }
        });

        return NextResponse.json({
            success: true,
            data: { scheduledReports }
        });
    }
);

/**
 * POST /api/reports/schedule
 * Create a new scheduled report
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const body = await req.json();
        const result = ScheduledReportSchema.safeParse(body);

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

        // Validate cron expression
        if (!isValidCron(validatedData.schedule)) {
            return NextResponse.json(
                { success: false, message: 'Invalid cron expression' },
                { status: 400 }
            );
        }

        // Verify report exists and belongs to tenant
        const report = await prisma.savedReport.findFirst({
            where: {
                id: validatedData.reportId,
                tenantId: session.tenantId
            }
        });

        if (!report) {
            return notFoundResponse('Report');
        }

        const nextRunAt = calculateNextRun(validatedData.schedule);

        const scheduledReport = await prisma.scheduledReport.create({
            data: {
                reportId: validatedData.reportId,
                tenantId: session.tenantId,
                schedule: validatedData.schedule,
                recipients: JSON.stringify(validatedData.recipients),
                format: validatedData.format,
                enabled: validatedData.enabled,
                nextRunAt,
                createdById: session.userId
            },
            include: {
                report: {
                    select: { id: true, name: true, chartType: true }
                },
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        return NextResponse.json({
            success: true,
            message: 'Scheduled report created successfully',
            data: { scheduledReport }
        }, { status: 201 });
    }
);

/**
 * PUT /api/reports/schedule
 * Update a scheduled report
 */
export const PUT = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const scheduleId = searchParams.get('id');

        if (!scheduleId) {
            return NextResponse.json(
                { success: false, message: 'Schedule ID is required' },
                { status: 400 }
            );
        }

        // Check ownership
        const existingSchedule = await prisma.scheduledReport.findFirst({
            where: {
                id: scheduleId,
                tenantId: session.tenantId
            }
        });

        if (!existingSchedule) {
            return notFoundResponse('Scheduled report');
        }

        const body = await req.json();
        const result = UpdateScheduledReportSchema.safeParse(body);

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

        if (validatedData.schedule) {
            if (!isValidCron(validatedData.schedule)) {
                return NextResponse.json(
                    { success: false, message: 'Invalid cron expression' },
                    { status: 400 }
                );
            }
            updateData.schedule = validatedData.schedule;
            updateData.nextRunAt = calculateNextRun(validatedData.schedule);
        }

        if (validatedData.recipients) {
            updateData.recipients = JSON.stringify(validatedData.recipients);
        }

        if (validatedData.format) {
            updateData.format = validatedData.format;
        }

        if (validatedData.enabled !== undefined) {
            updateData.enabled = validatedData.enabled;
        }

        const scheduledReport = await prisma.scheduledReport.update({
            where: { id: scheduleId },
            data: updateData,
            include: {
                report: {
                    select: { id: true, name: true, chartType: true }
                },
                createdBy: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        return NextResponse.json({
            success: true,
            message: 'Scheduled report updated successfully',
            data: { scheduledReport }
        });
    }
);

/**
 * DELETE /api/reports/schedule
 * Remove a scheduled report
 */
export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const scheduleId = searchParams.get('id');

        if (!scheduleId) {
            return NextResponse.json(
                { success: false, message: 'Schedule ID is required' },
                { status: 400 }
            );
        }

        // Check ownership
        const existingSchedule = await prisma.scheduledReport.findFirst({
            where: {
                id: scheduleId,
                tenantId: session.tenantId
            }
        });

        if (!existingSchedule) {
            return notFoundResponse('Scheduled report');
        }

        await prisma.scheduledReport.delete({
            where: { id: scheduleId }
        });

        return NextResponse.json({
            success: true,
            message: 'Scheduled report deleted successfully'
        });
    }
);
