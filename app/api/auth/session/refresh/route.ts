import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE_NAME, SESSION_EXPIRY_DAYS } from '@/lib/authConfig';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { addServerAuditLog } from '@/app/actions/audit';
import { errorResponse } from '@/lib/api/response-helpers';
import { getSessionCookieOptions } from '@/lib/authCookies';

// skipTenantCheck: true - Session refresh should work regardless of tenant context
export const POST = withApiHandler({ authRequired: true, skipTenantCheck: true }, async (req: NextRequest, context: ApiContext) => {
    const session = context.session!;
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

    // Extend session expiry
    const newExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.session.update({
        where: { id: session.sessionId },
        data: {
            expiresAt: newExpiresAt,
            lastActivityAt: new Date()
        }
    });

    await addServerAuditLog({
        actionType: 'SESSION_REFRESH',
        entityType: 'User',
        entityId: session.userId,
        description: 'Session refreshed',
        performedById: session.userId,
        sessionId: session.sessionId,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined
    });

    const response = NextResponse.json({
        success: true,
        expiresAt: newExpiresAt
    });

    // Set the cookie on the response
    const cookieOptions = getSessionCookieOptions(newExpiresAt);

    if (token) {
        // Fix: Use 'session_token' usually defined in default constant but plan says use 'session_token' manually or SESSION_COOKIE_NAME
        response.cookies.set(SESSION_COOKIE_NAME, token, cookieOptions);
    }

    return response;
});
