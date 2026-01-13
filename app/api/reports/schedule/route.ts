import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from '@/lib/auth';
import { ScheduledReportSchema, UpdateScheduledReportSchema } from '@/lib/validation/report-schemas';
import { z } from 'zod';

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

// GET - Fetch scheduled reports for current tenant
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const scheduledReports = await prisma.scheduledReport.findMany({
            where: {
                tenantId: session.user.tenantId
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
    } catch (error) {
        console.error('Error fetching scheduled reports:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch scheduled reports' },
            { status: 500 }
        );
    }
}

// POST - Create a new scheduled report
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const validatedData = ScheduledReportSchema.parse(body);

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
                tenantId: session.user.tenantId
            }
        });

        if (!report) {
            return NextResponse.json(
                { success: false, message: 'Report not found' },
                { status: 404 }
            );
        }

        const nextRunAt = calculateNextRun(validatedData.schedule);

        const scheduledReport = await prisma.scheduledReport.create({
            data: {
                reportId: validatedData.reportId,
                tenantId: session.user.tenantId,
                schedule: validatedData.schedule,
                recipients: JSON.stringify(validatedData.recipients),
                format: validatedData.format,
                enabled: validatedData.enabled,
                nextRunAt,
                createdById: session.user.id
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
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, message: 'Validation error', errors: error.errors },
                { status: 400 }
            );
        }
        console.error('Error creating scheduled report:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to create scheduled report' },
            { status: 500 }
        );
    }
}

// PUT - Update a scheduled report
export async function PUT(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
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
                tenantId: session.user.tenantId
            }
        });

        if (!existingSchedule) {
            return NextResponse.json(
                { success: false, message: 'Scheduled report not found' },
                { status: 404 }
            );
        }

        const body = await req.json();
        const validatedData = UpdateScheduledReportSchema.parse(body);

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
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, message: 'Validation error', errors: error.errors },
                { status: 400 }
            );
        }
        console.error('Error updating scheduled report:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to update scheduled report' },
            { status: 500 }
        );
    }
}

// DELETE - Remove a scheduled report
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
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
                tenantId: session.user.tenantId
            }
        });

        if (!existingSchedule) {
            return NextResponse.json(
                { success: false, message: 'Scheduled report not found' },
                { status: 404 }
            );
        }

        await prisma.scheduledReport.delete({
            where: { id: scheduleId }
        });

        return NextResponse.json({
            success: true,
            message: 'Scheduled report deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting scheduled report:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to delete scheduled report' },
            { status: 500 }
        );
    }
}
