import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

const SESSION_EXPIRY_DAYS = 7; // Should match auth.ts constant

export async function POST() {
    try {
        const session = await getSession(); // this validates the session first

        if (!session) {
            return NextResponse.json({ error: 'No active session' }, { status: 401 });
        }

        // Extend session expiry
        // If we want to support 'remember me', we might need to check the session record first, 
        // but typically a refresh bumps it by standard amount or re-confirms existing policy.
        // For simplicity, we stick to standard expiry or just bump by 7 days.

        const newExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        await prisma.session.update({
            where: { id: session.sessionId },
            data: {
                expiresAt: newExpiresAt,
                lastActivityAt: new Date()
            }
        });

        // We might want to update the cookie as well, but `getSession` relies on the database mostly.
        // The cookie also has an expiry. We probably should update the cookie maxAge.
        // However, `lib/auth.ts` doesn't export a `refreshCookie` helper easily. 
        // If the cookie expires, the browser deletes it. We definitely need to set the cookie again.
        // But for now, since we are using Database sessions, as long as the cookie lives, it's fine?
        // No, if cookie expires, browser drops it.
        // Ideally we should re-set the cookie here.
        // But `getSession` in `lib/auth.ts` creates the cookie.
        // Let's see if we can just update the DB for now, assuming the cookie is long-lived or session cookie.
        // `lib/auth.ts` sets cookie expires to `expiresAt`. So we DO need to update the cookie.

        // Simple implementation: The client will rely on the DB validity if the cookie persists. 
        // But we can't easily set the cookie here without importing `cookies` and duplicating logic or modifying `lib/auth`.
        // Let's assume for this task scope (which didn't explicitly ask for cookie re-issuance in the plan steps detailedly, 
        // although generally implied by "refresh") that DB update is primary. 
        // Wait, the plan step says "Add Session Refresh Endpoint... update expiresAt". 
        // It doesn't explicitly say "update cookie". 
        // However, strictly speaking, we should. 
        // I will stick to the plan which updates DB. The cookie might expire though. 
        // If I look at `lib/auth.ts`, `createSession` sets the cookie.
        // I will import `cookies` and set it just to be safe/robust.

        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const token = cookieStore.get('session_token')?.value;

        if (token) {
            cookieStore.set('session_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                expires: newExpiresAt,
                path: '/',
            });
        }

        return NextResponse.json({
            success: true,
            expiresAt: newExpiresAt
        });
    } catch (error) {
        console.error("Session refresh error:", error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
