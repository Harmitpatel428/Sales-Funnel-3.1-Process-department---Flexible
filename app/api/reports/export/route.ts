import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateReport } from '@/lib/reports/report-generator';
import type { ReportConfig } from '@/lib/validation/report-schemas';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';

/**
 * POST /api/reports/export
 * Export a report to file (Excel, PDF, CSV)
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const body = await req.json();
        const { reportId, config, format = 'EXCEL' } = body;

        let reportConfig: ReportConfig;

        if (reportId) {
            // Export saved report
            const savedReport = await prisma.savedReport.findFirst({
                where: { id: reportId, tenantId: session.tenantId }
            });
            if (!savedReport) {
                return notFoundResponse('Report');
            }
            reportConfig = JSON.parse(savedReport.config);
        } else if (config) {
            // Export ad-hoc config
            reportConfig = config;
        } else {
            return NextResponse.json({ success: false, message: 'Report ID or config required' }, { status: 400 });
        }

        const { buffer, fileName, mimeType, recordCount } = await generateReport(
            reportConfig, {}, format, session.tenantId
        );

        // Return file as binary response
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': mimeType,
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'X-Record-Count': String(recordCount)
            }
        });
    }
);
