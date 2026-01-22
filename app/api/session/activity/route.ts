import { NextRequest, NextResponse } from 'next/server';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

/**
 * POST /api/session/activity
 * Track user session activity
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, updateSessionActivity: false },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        // getSession already updates lastActivityAt as a side effect!
        // So we just need to check if session exists.
        if (session) {
            return NextResponse.json({ success: true, tracking: 'active' });
        } else {
            return unauthorizedResponse();
        }
    }
);
