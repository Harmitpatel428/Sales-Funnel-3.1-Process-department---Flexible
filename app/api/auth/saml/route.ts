import { NextRequest, NextResponse } from 'next/server';
import { handleSAMLLogin, handleSAMLCallback } from '@/lib/saml';
import { loginWithSSO } from '@/lib/auth';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

// POST /api/auth/saml -> Initiate Login
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
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
    } catch (error: any) {
        console.error("SAML Init Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET /api/auth/saml/callback -> ACS
// If acting as OAuth client to Jackson:
// Jackson Redirects here with ?code=...
export async function GET(req: NextRequest) {
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
        await loginWithSSO({
            email: profile.email,
            name: profile.firstName + ' ' + profile.lastName,
            provider: 'SAML', // Or specific provider name if available
            providerId: profile.id,
        });

        // Redirect to dashboard
        return NextResponse.redirect(new URL('/dashboard', req.url));
    } catch (error: any) {
        console.error("SAML Callback Error:", error);
        return NextResponse.redirect(new URL('/login?error=saml_failed', req.url));
    }
}
