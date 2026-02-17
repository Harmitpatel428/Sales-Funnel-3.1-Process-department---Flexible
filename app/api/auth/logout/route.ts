import { NextRequest, NextResponse } from 'next/server';
import { invalidateSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { addServerAuditLog } from '@/app/actions/audit';
import { errorResponse } from '@/lib/api/response-helpers';

/**
 * POST /api/auth/logout
 * 
 * Logout endpoint. Invalidates the session and deletes the session cookie.
 * 
 * ARCHITECTURAL RULE: This is the ONLY place where session_token cookie is deleted.
 * Server actions must never delete authentication cookies.
 */
// skipTenantCheck: true - Logout should work regardless of tenant context
export const POST = withApiHandler({ authRequired: true, updateSessionActivity: false, skipTenantCheck: true }, async (req: NextRequest, context: ApiContext) => {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = context.session!;

    // Invalidate session in database (pure domain function)
    await invalidateSessionByToken(token);

    await addServerAuditLog({
        actionType: 'LOGOUT',
        entityType: 'User',
        entityId: session.userId,
        description: 'User logged out',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
        performedById: session.userId,
        sessionId: session.sessionId
    });

    // Delete the cookie (API-layer responsibility)
    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE_NAME);

    return response;
});
