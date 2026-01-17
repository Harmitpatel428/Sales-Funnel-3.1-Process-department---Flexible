import { NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { getSessionTokenFromCookie } from '@/lib/authCookies';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const token = await getSessionTokenFromCookie();
        const session = await getSessionByToken(token);

        if (!session) {
            return NextResponse.json({ valid: false }, { status: 401 });
        }

        // Double check user status directly from DB to catch locks/deactivations immediately
        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: {
                id: true,
                role: true,
                isActive: true,
                lockedUntil: true,
                mfaEnabled: true, // using mfaEnabled as proxy for verification scope if needed, or just metadata
            }
        });

        if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) {
            return NextResponse.json({ valid: false }, { status: 401 });
        }

        // Compute permissions hash
        const permissions = await getUserPermissions(session.userId);
        const sortedPermissions = Array.from(permissions).sort();
        const permissionsHash = crypto.createHash('md5').update(sortedPermissions.join(',')).digest('hex');

        // Get real expiry from DB session (getSession generic only returns partial info sometimes, let's verify)
        // Actually getSession returns sessionId, we can query session details if needed, 
        // but the `session` object from getSession already did a DB lookup and confirmed validity.
        // However, we want the exact `expiresAt` which getSession implementation I saw earlier does check but might not return in the simplified object.
        // Let's re-fetch or rely on what we can get.
        // Looking at lib/auth.ts, getSession returns { userId, role, sessionId, tenantId }. 
        // It does NOT return expiresAt. We need to fetch it.

        const dbSession = await prisma.session.findUnique({
            where: { id: session.sessionId },
            select: { expiresAt: true, lastActivityAt: true }
        });

        if (!dbSession) {
            return NextResponse.json({ valid: false }, { status: 401 });
        }

        return NextResponse.json({
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

    } catch (error) {
        console.error('Session check error:', error);
        return NextResponse.json({ valid: false }, { status: 500 });
    }
}
