import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        // Here you would typically send to Sentry, LogRocket, or Datadog
        // For now we just log to server console in a structured way
        // This allows backend monitoring tools to pick it up

        const timestamp = new Date().toISOString();
        const reportId = body.id || 'unknown';
        const errors = body.errors || [];

        console.log(`[Telemetry] Received error report ${reportId} with ${errors.length} errors at ${timestamp}`);

        errors.forEach((err: any) => {
            console.error('[Telemetry Error]', {
                type: err.type,
                message: err.message,
                stack: err.stack,
                context: err.context,
                timestamp: err.timestamp
            });
        });

        return NextResponse.json({ success: true, message: 'Error report received' });
    } catch (error) {
        console.error('[Telemetry] Failed to process error report:', error);
        return NextResponse.json({ success: false, message: 'Failed to process error report' }, { status: 500 });
    }
}
