/**
 * Report Scheduler Job
 * Processes scheduled reports and sends them via email
 * Uses Bull queue for background job processing
 */

import Bull from 'bull';
import { prisma } from '@/lib/db';
import { generateReport } from '@/lib/reports/report-generator';
import { sendReportEmail } from '@/lib/email-service';

// Create Bull queue for report jobs
// In production, configure Redis connection
const reportQueue = new Bull('report-generation', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 50
    }
});

interface ReportJobData {
    scheduledReportId: string;
    reportId: string;
    tenantId: string;
    recipients: string[];
    format: 'EXCEL' | 'PDF' | 'CSV';
    reportName: string;
}

// Process report generation jobs
reportQueue.process(async (job) => {
    const { scheduledReportId, reportId, tenantId, recipients, format, reportName } = job.data as ReportJobData;

    console.log(`Processing scheduled report: ${reportName} (${scheduledReportId})`);

    try {
        // Fetch report configuration
        const report = await prisma.savedReport.findFirst({
            where: {
                id: reportId,
                tenantId
            }
        });

        if (!report) {
            throw new Error('Report not found');
        }

        const config = JSON.parse(report.config);

        // Generate report
        const { buffer, fileName } = await generateReport(config, {}, format, tenantId);

        // Send email to all recipients
        await sendReportEmail(
            recipients,
            reportName,
            buffer,
            fileName,
            {
                reportId,
                generatedAt: new Date().toISOString(),
                format
            }
        );

        // Update last run time and calculate next run
        const scheduledReport = await prisma.scheduledReport.findUnique({
            where: { id: scheduledReportId }
        });

        if (scheduledReport) {
            const nextRunAt = calculateNextRun(scheduledReport.schedule);
            await prisma.scheduledReport.update({
                where: { id: scheduledReportId },
                data: {
                    lastRunAt: new Date(),
                    nextRunAt
                }
            });
        }

        console.log(`Successfully sent report ${reportName} to ${recipients.length} recipients`);

        return { success: true, recipientCount: recipients.length };
    } catch (error) {
        console.error(`Failed to process report job:`, error);
        throw error;
    }
});

// Event handlers
reportQueue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed:`, result);
});

reportQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);

    // Log to audit log on final failure
    if (job.attemptsMade >= 3) {
        logReportFailure(job.data as ReportJobData, err.message);
    }
});

reportQueue.on('stalled', (job) => {
    console.warn(`Job ${job.id} stalled`);
});

// Calculate next run time from cron expression
function calculateNextRun(cron: string): Date {
    // Simplified implementation
    // In production, use a library like cron-parser
    const parts = cron.split(' ');
    const next = new Date();

    // Parse hour and minute if provided
    const minute = parts[0] !== '*' ? parseInt(parts[0]) : 0;
    const hour = parts[1] !== '*' ? parseInt(parts[1]) : 9;

    next.setHours(hour, minute, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (next <= new Date()) {
        next.setDate(next.getDate() + 1);
    }

    return next;
}

// Log report failure to audit
async function logReportFailure(jobData: ReportJobData, errorMessage: string) {
    try {
        await prisma.auditLog.create({
            data: {
                actionType: 'REPORT_GENERATION_FAILED',
                entityType: 'ScheduledReport',
                entityId: jobData.scheduledReportId,
                description: `Failed to generate and send scheduled report: ${jobData.reportName}. Error: ${errorMessage}`,
                tenantId: jobData.tenantId,
                metadata: JSON.stringify({
                    reportId: jobData.reportId,
                    recipients: jobData.recipients,
                    format: jobData.format,
                    attempts: 3
                })
            }
        });
    } catch (err) {
        console.error('Failed to log report failure:', err);
    }
}

/**
 * Schedule a report for immediate execution
 */
export async function scheduleReportNow(scheduledReportId: string): Promise<string> {
    const scheduledReport = await prisma.scheduledReport.findUnique({
        where: { id: scheduledReportId },
        include: {
            report: true
        }
    });

    if (!scheduledReport || !scheduledReport.report) {
        throw new Error('Scheduled report not found');
    }

    const job = await reportQueue.add({
        scheduledReportId: scheduledReport.id,
        reportId: scheduledReport.reportId,
        tenantId: scheduledReport.tenantId,
        recipients: JSON.parse(scheduledReport.recipients),
        format: scheduledReport.format,
        reportName: scheduledReport.report.name
    });

    return job.id.toString();
}

/**
 * Process all due scheduled reports
 * This should be called by a cron job or scheduler
 */
export async function processDueReports(): Promise<number> {
    const now = new Date();

    const dueReports = await prisma.scheduledReport.findMany({
        where: {
            enabled: true,
            nextRunAt: { lte: now }
        },
        include: {
            report: true
        }
    });

    console.log(`Found ${dueReports.length} due reports to process`);

    let scheduled = 0;
    for (const scheduledReport of dueReports) {
        if (!scheduledReport.report) continue;

        await reportQueue.add({
            scheduledReportId: scheduledReport.id,
            reportId: scheduledReport.reportId,
            tenantId: scheduledReport.tenantId,
            recipients: JSON.parse(scheduledReport.recipients),
            format: scheduledReport.format,
            reportName: scheduledReport.report.name
        });

        scheduled++;
    }

    return scheduled;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        reportQueue.getWaitingCount(),
        reportQueue.getActiveCount(),
        reportQueue.getCompletedCount(),
        reportQueue.getFailedCount(),
        reportQueue.getDelayedCount()
    ]);

    return { waiting, active, completed, failed, delayed };
}

export { reportQueue };
