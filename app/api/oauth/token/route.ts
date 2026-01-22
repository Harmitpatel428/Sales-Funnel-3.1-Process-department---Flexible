import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, refreshAccessToken, revokeToken } from '@/lib/oauth/server';
import {
    withApiHandler,
    ApiContext,
} from '@/lib/api/withApiHandler';

/**
 * POST /api/oauth/token
 * Token exchange endpoint - public endpoint
 */
export const POST = withApiHandler(
    { authRequired: false, checkDbHealth: true },
    async (req: NextRequest, _context: ApiContext) => {
        const contentType = req.headers.get('content-type');
        let body: any;

        // Support both JSON and form-urlencoded
        if (contentType?.includes('application/x-www-form-urlencoded')) {
            const formData = await req.formData();
            body = Object.fromEntries(formData.entries());
        } else {
            body = await req.json();
        }

        const { grant_type, code, redirect_uri, client_id, client_secret, refresh_token } = body;

        // Validate grant type
        if (!grant_type) {
            return NextResponse.json(
                { error: 'invalid_request', error_description: 'grant_type is required' },
                { status: 400 }
            );
        }

        // Handle authorization code grant
        if (grant_type === 'authorization_code') {
            if (!code || !redirect_uri || !client_id || !client_secret) {
                return NextResponse.json(
                    { error: 'invalid_request', error_description: 'Missing required parameters' },
                    { status: 400 }
                );
            }

            const tokens = await exchangeCodeForToken(code, client_id, client_secret, redirect_uri);

            if (!tokens) {
                return NextResponse.json(
                    { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
                    { status: 400 }
                );
            }

            return NextResponse.json({
                access_token: tokens.accessToken,
                token_type: tokens.tokenType,
                expires_in: tokens.expiresIn,
                refresh_token: tokens.refreshToken,
                scope: tokens.scope,
            });
        }

        // Handle refresh token grant
        if (grant_type === 'refresh_token') {
            if (!refresh_token || !client_id || !client_secret) {
                return NextResponse.json(
                    { error: 'invalid_request', error_description: 'Missing required parameters' },
                    { status: 400 }
                );
            }

            const tokens = await refreshAccessToken(refresh_token, client_id, client_secret);

            if (!tokens) {
                return NextResponse.json(
                    { error: 'invalid_grant', error_description: 'Invalid refresh token' },
                    { status: 400 }
                );
            }

            return NextResponse.json({
                access_token: tokens.accessToken,
                token_type: tokens.tokenType,
                expires_in: tokens.expiresIn,
                refresh_token: tokens.refreshToken,
            });
        }

        return NextResponse.json(
            { error: 'unsupported_grant_type', error_description: 'Grant type not supported' },
            { status: 400 }
        );
    }
);

/**
 * DELETE /api/oauth/token
 * Revoke token - public endpoint
 */
export const DELETE = withApiHandler(
    { authRequired: false, checkDbHealth: true },
    async (req: NextRequest, _context: ApiContext) => {
        const body = await req.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json(
                { error: 'invalid_request', error_description: 'Token is required' },
                { status: 400 }
            );
        }

        await revokeToken(token);

        // Per RFC 7009, always return success even if token doesn't exist
        return NextResponse.json({ success: true });
    }
);
