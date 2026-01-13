import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from '@/lib/auth';
import { SavedReportSchema, UpdateSavedReportSchema } from '@/lib/validation/report-schemas';
import { z } from 'zod';

// GET - Fetch saved reports for current tenant
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const includePublic = searchParams.get('includePublic') === 'true';

        const whereClause: any = {
            tenantId: session.user.tenantId
        };

        // If not including public, only show user's own reports
        if (!includePublic) {
            whereClause.createdById = session.user.id;
        } else {
            // Include own reports and public reports
            whereClause.OR = [
                { createdById: session.user.id },
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
    } catch (error) {
        console.error('Error fetching saved reports:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch reports' },
            { status: 500 }
        );
    }
}

// POST - Create a new saved report
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const validatedData = SavedReportSchema.parse(body);

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
                tenantId: session.user.tenantId,
                createdById: session.user.id
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
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, message: 'Validation error', errors: error.errors },
                { status: 400 }
            );
        }
        console.error('Error creating saved report:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to create report' },
            { status: 500 }
        );
    }
}

// PUT - Update a saved report
export async function PUT(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
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
                tenantId: session.user.tenantId,
                createdById: session.user.id
            }
        });

        if (!existingReport) {
            return NextResponse.json(
                { success: false, message: 'Report not found or unauthorized' },
                { status: 404 }
            );
        }

        const body = await req.json();
        const validatedData = UpdateSavedReportSchema.parse(body);

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
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, message: 'Validation error', errors: error.errors },
                { status: 400 }
            );
        }
        console.error('Error updating saved report:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to update report' },
            { status: 500 }
        );
    }
}

// DELETE - Remove a saved report
export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
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
                tenantId: session.user.tenantId,
                createdById: session.user.id
            }
        });

        if (!existingReport) {
            return NextResponse.json(
                { success: false, message: 'Report not found or unauthorized' },
                { status: 404 }
            );
        }

        await prisma.savedReport.delete({
            where: { id: reportId }
        });

        return NextResponse.json({
            success: true,
            message: 'Report deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting saved report:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to delete report' },
            { status: 500 }
        );
    }
}
