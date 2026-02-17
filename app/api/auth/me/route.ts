import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { unauthorizedResponse } from '@/lib/api/response-helpers';

export const dynamic = 'force-dynamic';

// skipTenantCheck: true - User profile endpoint may be called before tenant selection in multi-tenant scenarios
export const GET = withApiHandler({ authRequired: true, updateSessionActivity: true, skipTenantCheck: true }, async (_req: NextRequest, context: ApiContext) => {
    // Session is guaranteed to exist due to authRequired: true
    const session = context.session!;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
            id: true,
            username: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            roleId: true,
            customRole: {
                select: {
                    id: true,
                    name: true,
                }
            },
            mfaEnabled: true,
            ssoProvider: true,
            lastLoginAt: true,
            lockedUntil: true
        },
    });

    if (!user || !user.isActive) {
        return unauthorizedResponse();
    }

    const permissions = Array.from(await getUserPermissions(user.id));

    // Calculate permissions hash for client-side change detection
    const crypto = require('crypto');
    const sortedPermissions = [...permissions].sort();
    const permissionsHash = crypto.createHash('md5').update(sortedPermissions.join(',')).digest('hex');

    // Fetch session expiry from DB
    const dbSession = await prisma.session.findUnique({
        where: { id: session.sessionId },
        select: { expiresAt: true, lastActivityAt: true }
    });

    const userProfile = {
        userId: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: permissions,
        roleId: user.roleId,
        customRole: user.customRole,
        mfaEnabled: user.mfaEnabled,
        ssoProvider: user.ssoProvider,
        lastLoginAt: user.lastLoginAt?.toISOString(),
        lockedUntil: user.lockedUntil // Needed for account lock check
    };

    // Response includes both success and valid fields for backward compatibility
    // Clients may depend on 'valid' field, but new code should use 'success'
    return NextResponse.json({
        success: true,
        valid: true,
        user: userProfile,
        expiresAt: dbSession?.expiresAt,
        lastActivityAt: dbSession?.lastActivityAt,
        permissionsHash
    }, {
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    });
});
