import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { validateOAuthClient, generateAuthorizationCode, OAUTH_SCOPES, OAUTH_SCOPE_DESCRIPTIONS } from '@/lib/oauth/server';

// GET /api/oauth/authorize - Authorization endpoint
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        const { searchParams } = new URL(req.url);

        const clientId = searchParams.get('client_id');
        const redirectUri = searchParams.get('redirect_uri');
        const responseType = searchParams.get('response_type');
        const scope = searchParams.get('scope');
        const state = searchParams.get('state');

        // Validate required parameters
        if (!clientId || !redirectUri || !responseType) {
            return NextResponse.json(
                { error: 'invalid_request', error_description: 'Missing required parameters' },
                { status: 400 }
            );
        }

        if (responseType !== 'code') {
            return NextResponse.json(
                { error: 'unsupported_response_type', error_description: 'Only authorization_code flow is supported' },
                { status: 400 }
            );
        }

        // Validate client
        const validation = await validateOAuthClient(clientId, redirectUri);
        if (!validation.valid) {
            return NextResponse.json(
                { error: 'invalid_client', error_description: validation.error },
                { status: 400 }
            );
        }

        // If user is not logged in, redirect to login
        if (!session) {
            const loginUrl = `/login?oauth=true&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope || ''}&state=${state || ''}`;
            return NextResponse.redirect(new URL(loginUrl, req.url));
        }

        // Parse and validate scopes
        const requestedScopes = scope ? scope.split(' ') : [];
        const allowedScopes = JSON.parse(validation.client.scopes) as string[];
        const validScopes = requestedScopes.filter(s => allowedScopes.includes(s));

        // Return authorization page data
        return NextResponse.json({
            success: true,
            data: {
                client: {
                    id: validation.client.clientId,
                    name: validation.client.name,
                    description: validation.client.description,
                    logoUrl: validation.client.logoUrl,
                    websiteUrl: validation.client.websiteUrl,
                    privacyUrl: validation.client.privacyUrl,
                    termsUrl: validation.client.termsUrl,
                },
                scopes: validScopes.map(s => ({
                    name: s,
                    description: OAUTH_SCOPE_DESCRIPTIONS[s] || s,
                })),
                redirectUri,
                state,
            },
        });
    } catch (error: any) {
        console.error('OAuth authorize error:', error);
        return NextResponse.json(
            { error: 'server_error', error_description: 'An error occurred' },
            { status: 500 }
        );
    }
}

// POST /api/oauth/authorize - User approves authorization
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json(
                { error: 'access_denied', error_description: 'User not authenticated' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { client_id, redirect_uri, scope, state, approved } = body;

        if (!approved) {
            // User denied authorization
            const redirectUrl = new URL(redirect_uri);
            redirectUrl.searchParams.set('error', 'access_denied');
            redirectUrl.searchParams.set('error_description', 'User denied authorization');
            if (state) redirectUrl.searchParams.set('state', state);

            return NextResponse.json({
                success: false,
                redirect: redirectUrl.toString(),
            });
        }

        // Validate client again
        const validation = await validateOAuthClient(client_id, redirect_uri);
        if (!validation.valid) {
            return NextResponse.json(
                { error: 'invalid_client', error_description: validation.error },
                { status: 400 }
            );
        }

        // Parse scopes
        const scopes = typeof scope === 'string' ? scope.split(' ') : scope;

        // Generate authorization code
        const code = await generateAuthorizationCode(
            client_id,
            session.userId,
            scopes,
            redirect_uri
        );

        // Build redirect URL with code
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', code);
        if (state) redirectUrl.searchParams.set('state', state);

        return NextResponse.json({
            success: true,
            redirect: redirectUrl.toString(),
        });
    } catch (error: any) {
        console.error('OAuth authorize POST error:', error);
        return NextResponse.json(
            { error: 'server_error', error_description: 'An error occurred' },
            { status: 500 }
        );
    }
}
