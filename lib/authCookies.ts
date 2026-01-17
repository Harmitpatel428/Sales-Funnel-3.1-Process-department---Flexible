/**
 * API-LAYER COOKIE HELPERS
 * 
 * This module handles all cookie operations for authentication.
 * It MUST ONLY be imported by API routes, never by server actions or client code.
 * 
 * ARCHITECTURAL RULE: If you're importing this file and you're not in app/api/auth/,
 * you're violating the architecture. Use lib/auth.ts domain functions instead.
 */

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, SESSION_EXPIRY_DAYS, REMEMBER_ME_EXPIRY_DAYS } from './authConfig';

// Export cookie name for API routes' convenience
export { SESSION_COOKIE_NAME };

/**
 * Get session cookie configuration.
 * Used by API routes to set cookies with consistent options.
 */
export function getSessionCookieOptions(expiresAt: Date) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        expires: expiresAt,
        path: '/',
    };
}

/**
 * Calculate session expiry date.
 */
export function calculateSessionExpiry(rememberMe: boolean): Date {
    const expiryDays = rememberMe ? REMEMBER_ME_EXPIRY_DAYS : SESSION_EXPIRY_DAYS;
    return new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
}

/**
 * Get the session token from the cookie (read-only).
 * Used by API routes and server functions to retrieve the current session token.
 */
export async function getSessionTokenFromCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
}

/**
 * Get the session token from a NextRequest object (read-only).
 * Used by Middleware or API routes that have a request object.
 */
export function getSessionTokenFromRequest(req: NextRequest): string | null {
    return req.cookies.get(SESSION_COOKIE_NAME)?.value || null;
}

/**
 * Set the session token cookie.
 * MUST ONLY be called from API routes using NextResponse.cookies.set().
 * 
 * This function is provided for reference only. API routes should use:
 *   response.cookies.set('session_token', token, getSessionCookieOptions(expiresAt))
 * 
 * @deprecated Use NextResponse.cookies.set() directly in API routes
 */
export function setSessionTokenCookie(token: string, expiresAt: Date) {
    throw new Error(
        '[ARCHITECTURE VIOLATION] setSessionTokenCookie() must not be called. ' +
        'API routes must use NextResponse.cookies.set() directly. ' +
        'See lib/authCookies.ts for details.'
    );
}

/**
 * Delete the session token cookie.
 * MUST ONLY be called from API routes using NextResponse.cookies.delete().
 * 
 * This function is provided for reference only. API routes should use:
 *   response.cookies.delete('session_token')
 * 
 * @deprecated Use NextResponse.cookies.delete() directly in API routes
 */
export function deleteSessionTokenCookie() {
    throw new Error(
        '[ARCHITECTURE VIOLATION] deleteSessionTokenCookie() must not be called. ' +
        'API routes must use NextResponse.cookies.delete() directly. ' +
        'See lib/authCookies.ts for details.'
    );
}
