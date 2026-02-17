import { NextResponse } from 'next/server';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { unauthorizedResponse } from '@/lib/api/response-helpers';

export const dynamic = 'force-dynamic';

// skipTenantCheck: true - Session validation endpoint used by client to check auth status
export const GET = withApiHandler({ authRequired: true, updateSessionActivity: false, skipTenantCheck: true }, async (context: ApiContext) => {
    const session = context.session!;

    // Double check user status directly from DB to catch locks/deactivations immediately
    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
            id: true,
            role: true,
            isActive: true,
            lockedUntil: true,
            mfaEnabled: true,
        }
    });

    if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) {
        return unauthorizedResponse();
    }

    // Compute permissions hash
    const permissions = await getUserPermissions(session.userId);
    const sortedPermissions = Array.from(permissions).sort();
    const permissionsHash = crypto.createHash('md5').update(sortedPermissions.join(',')).digest('hex');

    const dbSession = await prisma.session.findUnique({
        where: { id: session.sessionId },
        select: { expiresAt: true, lastActivityAt: true }
    });

    if (!dbSession) {
        return unauthorizedResponse();
    }

    // Response includes both success and valid fields for backward compatibility
    // Clients may depend on 'valid' field, but new code should use 'success'
    return NextResponse.json({
        success: true,
        valid: true,
        expiresAt: dbSession.expiresAt,
        lastActivityAt: dbSession.lastActivityAt,
        permissionsHash,
        user: {
            id: user.id,
            role: user.role,
            isActive: user.isActive,
            lockedUntil: user.lockedUntil,
            mfaEnabled: user.mfaEnabled
        }
    });
});
