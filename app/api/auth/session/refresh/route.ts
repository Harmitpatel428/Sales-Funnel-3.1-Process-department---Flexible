import { NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { getSessionTokenFromCookie } from '@/lib/authCookies';
import { prisma } from '@/lib/db';
import { SESSION_EXPIRY_DAYS } from '@/lib/authConfig';

export async function POST() {
    try {
        const token = await getSessionTokenFromCookie();
        const session = await getSessionByToken(token); // this validates the session first

        if (!session) {
            return NextResponse.json({ error: 'No active session' }, { status: 401 });
        }

        // Extend session expiry
        const newExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        await prisma.session.update({
            where: { id: session.sessionId },
            data: {
                expiresAt: newExpiresAt,
                lastActivityAt: new Date()
            }
        });

        const response = NextResponse.json({
            success: true,
            expiresAt: newExpiresAt
        });

        // Set the cookie on the response using shared helper options
        const { getSessionCookieOptions } = await import('@/lib/authCookies');
        const cookieOptions = getSessionCookieOptions(newExpiresAt);

        if (token) {
            response.cookies.set(cookieOptions.name, token, cookieOptions);
        }

        return response;
    } catch (error) {
        console.error("Session refresh error:", error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
