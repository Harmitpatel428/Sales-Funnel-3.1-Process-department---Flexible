import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from '@/lib/auth';
import { generateReport } from '@/lib/reports/report-generator';
import type { ReportConfig } from '@/lib/validation/report-schemas';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { reportId, config, format = 'EXCEL' } = body;

        let reportConfig: ReportConfig;

        if (reportId) {
            // Export saved report
            const savedReport = await prisma.savedReport.findFirst({
                where: { id: reportId, tenantId: session.user.tenantId }
            });
            if (!savedReport) {
                return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
            }
            reportConfig = JSON.parse(savedReport.config);
        } else if (config) {
            // Export ad-hoc config
            reportConfig = config;
        } else {
            return NextResponse.json({ success: false, message: 'Report ID or config required' }, { status: 400 });
        }

        const { buffer, fileName, mimeType, recordCount } = await generateReport(
            reportConfig, {}, format, session.user.tenantId
        );

        // Return file as binary response
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': mimeType,
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'X-Record-Count': String(recordCount)
            }
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ success: false, message: 'Export failed' }, { status: 500 });
    }
}
