import { NextRequest, NextResponse } from 'next/server';
import { getUserPermissions } from '@/lib/middleware/permissions';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/debug/permissions
 * Debug endpoint to view current user permissions
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const permissions = await getUserPermissions(session.userId);

        return NextResponse.json({
            success: true,
            data: {
                userId: session.userId,
                username: session.username,
                role: session.role,
                permissions
            }
        });
    }
);
