import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createOAuthClient, OAUTH_SCOPES, OAUTH_SCOPE_DESCRIPTIONS } from '@/lib/oauth/server';
import { prisma } from '@/lib/db';

// GET /api/oauth/clients - List OAuth clients
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
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
    } catch (error: any) {
        console.error('Error fetching OAuth clients:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch OAuth clients' },
            { status: 500 }
        );
    }
}

// POST /api/oauth/clients - Create OAuth client
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, redirectUris, scopes, description, logoUrl, websiteUrl, privacyUrl, termsUrl, isPublic } = body;

        // Validate required fields
        if (!name || typeof name !== 'string') {
            return NextResponse.json(
                { success: false, message: 'Name is required' },
                { status: 400 }
            );
        }

        if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
            return NextResponse.json(
                { success: false, message: 'At least one redirect URI is required' },
                { status: 400 }
            );
        }

        // Validate redirect URIs
        for (const uri of redirectUris) {
            try {
                new URL(uri);
            } catch {
                return NextResponse.json(
                    { success: false, message: `Invalid redirect URI: ${uri}` },
                    { status: 400 }
                );
            }
        }

        if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
            return NextResponse.json(
                { success: false, message: 'At least one scope is required' },
                { status: 400 }
            );
        }

        // Validate scopes
        const validScopes = Object.values(OAUTH_SCOPES);
        const invalidScopes = scopes.filter((s: string) => !validScopes.includes(s as any));
        if (invalidScopes.length > 0) {
            return NextResponse.json(
                { success: false, message: `Invalid scopes: ${invalidScopes.join(', ')}` },
                { status: 400 }
            );
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
    } catch (error: any) {
        console.error('Error creating OAuth client:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to create OAuth client' },
            { status: 500 }
        );
    }
}
