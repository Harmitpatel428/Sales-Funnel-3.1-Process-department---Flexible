import { NextResponse } from 'next/server';
import { invalidateSessionByToken } from '@/lib/auth';
import { getSessionTokenFromCookie } from '@/lib/authCookies';

/**
 * POST /api/auth/logout
 * 
 * Logout endpoint. Invalidates the session and deletes the session cookie.
 * 
 * ARCHITECTURAL RULE: This is the ONLY place where session_token cookie is deleted.
 * Server actions must never delete authentication cookies.
 */
export async function POST(req: Request) {
    try {
        const token = await getSessionTokenFromCookie();

        // Invalidate session in database (pure domain function)
        await invalidateSessionByToken(token);

        // Delete the cookie (API-layer responsibility)
        const response = NextResponse.json({ success: true });
        response.cookies.delete('session_token');

        return response;
    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
