import { NextRequest, NextResponse } from 'next/server';
import {
    withApiHandler,
    ApiContext,
} from '@/lib/api/withApiHandler';

/**
 * POST /api/telemetry/errors
 * Receive error reports from client - public endpoint (no auth required)
 */
export const POST = withApiHandler(
    { authRequired: false, checkDbHealth: false, rateLimit: 50, logRequest: true },
    async (req: NextRequest, _context: ApiContext) => {
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
    }
);
