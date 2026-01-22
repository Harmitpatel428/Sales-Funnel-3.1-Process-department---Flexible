import { NextRequest, NextResponse } from 'next/server';
import { createOAuthClient, OAUTH_SCOPES, OAUTH_SCOPE_DESCRIPTIONS } from '@/lib/oauth/server';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    validationErrorResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/oauth/clients
 * List OAuth clients
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (_req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const clients = await prisma.oAuthClient.findMany({
            where: { tenantId: session.tenantId },
            select: {
                id: true,
                clientId: true,
                name: true,
                description: true,
                redirectUris: true,
                scopes: true,
                logoUrl: true,
                websiteUrl: true,
                isActive: true,
                isPublic: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: { tokens: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        const formattedClients = clients.map(client => ({
            ...client,
            redirectUris: JSON.parse(client.redirectUris),
            scopes: JSON.parse(client.scopes),
            activeTokens: client._count.tokens,
        }));

        return NextResponse.json({
            success: true,
            data: formattedClients,
            meta: {
                availableScopes: Object.values(OAUTH_SCOPES),
                scopeDescriptions: OAUTH_SCOPE_DESCRIPTIONS,
            },
        });
    }
);

/**
 * POST /api/oauth/clients
 * Create OAuth client
 */
export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const body = await req.json();
        const { name, redirectUris, scopes, description, logoUrl, websiteUrl, privacyUrl, termsUrl, isPublic } = body;

        // Validate required fields
        const errors: { field: string; message: string; code: string }[] = [];

        if (!name || typeof name !== 'string') {
            errors.push({ field: 'name', message: 'Name is required', code: 'required' });
        }

        if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
            errors.push({ field: 'redirectUris', message: 'At least one redirect URI is required', code: 'required' });
        } else {
            // Validate redirect URIs
            for (let i = 0; i < redirectUris.length; i++) {
                try {
                    new URL(redirectUris[i]);
                } catch {
                    errors.push({ field: `redirectUris[${i}]`, message: `Invalid redirect URI: ${redirectUris[i]}`, code: 'invalid_url' });
                }
            }
        }

        if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
            errors.push({ field: 'scopes', message: 'At least one scope is required', code: 'required' });
        } else {
            // Validate scopes
            const validScopes = Object.values(OAUTH_SCOPES);
            const invalidScopes = scopes.filter((s: string) => !validScopes.includes(s as any));
            if (invalidScopes.length > 0) {
                errors.push({ field: 'scopes', message: `Invalid scopes: ${invalidScopes.join(', ')}`, code: 'invalid_value' });
            }
        }

        if (errors.length > 0) {
            return validationErrorResponse(errors);
        }

        const result = await createOAuthClient(
            session.tenantId,
            name,
            redirectUris,
            scopes,
            { description, logoUrl, websiteUrl, privacyUrl, termsUrl, isPublic }
        );

        return NextResponse.json({
            success: true,
            data: {
                clientId: result.clientId,
                clientSecret: result.clientSecret, // Only shown once!
            },
            message: 'OAuth client created. Save the client secret now - you won\'t be able to see it again!',
        }, { status: 201 });
    }
);
