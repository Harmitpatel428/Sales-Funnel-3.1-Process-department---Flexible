import { NextRequest, NextResponse } from 'next/server';
import { handleSAMLLogin, handleSAMLCallback } from '@/lib/saml';
import { loginWithSSO } from '@/lib/auth';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { errorResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';
import { calculateSessionExpiry, getSessionCookieOptions } from '@/lib/authCookies';

// POST /api/auth/saml -> Initiate Login
export const POST = withApiHandler({ authRequired: false, rateLimit: 10 }, async (context: ApiContext) => {
    const body = await context.req.json();
    const { tenantId } = body;

    if (!tenantId) {
        return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
    }

    // Generate and store state
    const state = randomBytes(32).toString('hex');
    const cookieStore = await cookies();
    cookieStore.set('saml_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 300, // 5 minutes
    });

    const redirectUrl = await handleSAMLLogin(tenantId, state);

    return NextResponse.json({ redirectUrl });
});

// GET /api/auth/saml/callback -> ACS
export const GET = withApiHandler({ authRequired: false }, async (context: ApiContext) => {
    const req = context.req;
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    // Verify state
    const cookieStore = await cookies();
    const storedState = cookieStore.get('saml_state')?.value;

    if (!state || !storedState || state !== storedState) {
        console.error("SAML State Mismatch", { state, storedState });
        return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    }

    // Clear state cookie
    cookieStore.delete('saml_state');

    try {
        const profile = await handleSAMLCallback(code);

        // Login the user
        const { user, token } = await loginWithSSO({
            email: profile.email,
            name: profile.firstName + ' ' + profile.lastName,
            provider: 'SAML', // Or specific provider name if available
            providerId: profile.id,
        });

        await addServerAuditLog({
            actionType: 'LOGIN_SAML_SUCCESS',
            entityType: 'User',
            entityId: user.id,
            description: 'SAML login successful',
            performedById: user.id,
            sessionId: token, // token used as session identifier
            ipAddress: req.headers.get('x-forwarded-for') || undefined,
            userAgent: req.headers.get('user-agent') || undefined
        });

        // Redirect to dashboard
        const response = NextResponse.redirect(new URL('/dashboard', req.url));

        // Set session cookie
        const expiresAt = calculateSessionExpiry(false);
        const cookieOptions = getSessionCookieOptions(expiresAt);
        response.cookies.set('session_token', token, cookieOptions);

        return response;

    } catch (error: any) {
        console.error("SAML Callback Error:", error);

        // Audit log failure
        await addServerAuditLog({
            actionType: 'LOGIN_SAML_FAILED',
            description: `SAML login failed: ${error.message}`,
            ipAddress: req.headers.get('x-forwarded-for') || undefined,
            userAgent: req.headers.get('user-agent') || undefined
        });

        return NextResponse.redirect(new URL('/login?error=saml_failed', req.url));
    }
});
