import { NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { getSessionTokenFromCookie } from '@/lib/authCookies';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { prisma } from '@/lib/db';
import { updateSessionActivity } from '@/lib/middleware/session-activity';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const token = await getSessionTokenFromCookie();
        const session = await getSessionByToken(token);

        if (!session) {
            return NextResponse.json({ user: null }, { status: 401 });
        }

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
            return NextResponse.json({ user: null }, { status: 401 });
        }

        // Side Effect: Update session activity only after successful auth
        // We can safely await this or let it run in background, but awaiting ensures it works before response
        await updateSessionActivity(request);

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

        return NextResponse.json({
            valid: true,
            user: userProfile,
            expiresAt: dbSession?.expiresAt,
            lastActivityAt: dbSession?.lastActivityAt,
            permissionsHash
        });

    } catch (error) {
        console.error('Auth check error:', error);
        return NextResponse.json({ user: null }, { status: 500 });
    }
}
