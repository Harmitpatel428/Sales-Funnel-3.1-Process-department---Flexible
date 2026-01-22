import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/bulk/export
 * Bulk data export with format options
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { searchParams } = new URL(req.url);
        const format = searchParams.get('format') || 'json';
        const entityType = searchParams.get('entityType') || 'leads';
        const status = searchParams.get('status');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const fields = searchParams.get('fields')?.split(',');

        if (!['json', 'csv', 'xlsx'].includes(format)) {
            return NextResponse.json(
                { success: false, message: 'Invalid format. Use json, csv, or xlsx' },
                { status: 400 }
            );
        }

        // Build query
        const where: any = {
            tenantId: session.tenantId,
            isDeleted: false,
        };

        if (status) where.status = status;
        if (startDate) where.createdAt = { gte: new Date(startDate) };
        if (endDate) {
            where.createdAt = where.createdAt || {};
            where.createdAt.lte = new Date(endDate);
        }

        let data: any[] = [];

        if (entityType === 'leads') {
            data = await prisma.lead.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                select: fields ? Object.fromEntries(fields.map(f => [f, true])) : {
                    id: true,
                    clientName: true,
                    mobileNumber: true,
                    email: true,
                    company: true,
                    source: true,
                    status: true,
                    notes: true,
                    kva: true,
                    consumerNumber: true,
                    discom: true,
                    gidc: true,
                    gstNumber: true,
                    companyLocation: true,
                    unitType: true,
                    marketingObjective: true,
                    budget: true,
                    termLoan: true,
                    timeline: true,
                    contactOwner: true,
                    followUpDate: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        } else if (entityType === 'cases') {
            data = await prisma.case.findMany({
                where: { tenantId: session.tenantId },
                orderBy: { createdAt: 'desc' },
                select: fields ? Object.fromEntries(fields.map(f => [f, true])) : {
                    caseId: true,
                    leadId: true,
                    caseNumber: true,
                    schemeType: true,
                    caseType: true,
                    processStatus: true,
                    priority: true,
                    clientName: true,
                    company: true,
                    mobileNumber: true,
                    consumerNumber: true,
                    kva: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }

        // Format response based on requested format
        if (format === 'json') {
            return NextResponse.json({
                success: true,
                data,
                meta: {
                    total: data.length,
                    entityType,
                    exportedAt: new Date().toISOString(),
                },
            });
        }

        if (format === 'csv') {
            const csv = convertToCSV(data);
            return new NextResponse(csv, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="${entityType}_export_${Date.now()}.csv"`,
                },
            });
        }

        if (format === 'xlsx') {
            // For XLSX, we return JSON with a flag - client should use a library to convert
            // In a full implementation, you'd use a library like xlsx or exceljs
            const xlsxData = {
                sheets: [
                    {
                        name: entityType,
                        data: data,
                    },
                ],
            };

            return NextResponse.json({
                success: true,
                format: 'xlsx',
                data: xlsxData,
                message: 'Use client-side library to convert to XLSX',
            });
        }

        return NextResponse.json({ success: true, data });
    }
);

function convertToCSV(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const headerRow = headers.join(',');

    const dataRows = data.map(row => {
        return headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string') {
                // Escape quotes and wrap in quotes if contains comma or newline
                if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }
            if (value instanceof Date) {
                return value.toISOString();
            }
            return String(value);
        }).join(',');
    });

    return [headerRow, ...dataRows].join('\n');
}
