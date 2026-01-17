import { NextRequest, NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { generateApiKey, API_SCOPES, SCOPE_DESCRIPTIONS } from '@/lib/api-keys';
import { prisma } from '@/lib/db';

// GET /api/api-keys - List all API keys for the tenant
export async function GET(req: NextRequest) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const includeUsage = searchParams.get('includeUsage') === 'true';

        const apiKeys = await prisma.apiKey.findMany({
            where: { tenantId: session.tenantId },
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                scopes: true,
                rateLimit: true,
                isActive: true,
                expiresAt: true,
                lastUsedAt: true,
                createdAt: true,
                environment: true,
                description: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                _count: includeUsage ? {
                    select: { usageLogs: true },
                } : undefined,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Parse scopes JSON
        const formattedKeys = apiKeys.map(key => ({
            ...key,
            scopes: JSON.parse(key.scopes),
        }));

        return NextResponse.json({
            success: true,
            data: formattedKeys,
            meta: {
                availableScopes: Object.values(API_SCOPES),
                scopeDescriptions: SCOPE_DESCRIPTIONS,
            },
        });
    } catch (error: any) {
        console.error('Error fetching API keys:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch API keys' },
            { status: 500 }
        );
    }
}

// POST /api/api-keys - Create a new API key
export async function POST(req: NextRequest) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, scopes, rateLimit, expiresAt, environment, description } = body;

        // Validate required fields
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { success: false, message: 'Name is required' },
                { status: 400 }
            );
        }

        if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
            return NextResponse.json(
                { success: false, message: 'At least one scope is required' },
                { status: 400 }
            );
        }

        // Validate scopes
        const validScopes = Object.values(API_SCOPES);
        const invalidScopes = scopes.filter(s => !validScopes.includes(s));
        if (invalidScopes.length > 0) {
            return NextResponse.json(
                { success: false, message: `Invalid scopes: ${invalidScopes.join(', ')}` },
                { status: 400 }
            );
        }

        // Generate the API key
        const result = await generateApiKey(
            session.tenantId,
            session.userId,
            name.trim(),
            scopes,
            {
                rateLimit: rateLimit || 1000,
                expiresAt: expiresAt ? new Date(expiresAt) : undefined,
                environment: environment || 'production',
                description,
            }
        );

        return NextResponse.json({
            success: true,
            data: {
                id: result.id,
                key: result.key, // Only returned once!
                keyPrefix: result.keyPrefix,
            },
            message: 'API key created successfully. Save this key now - you won\'t be able to see it again!',
        }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating API key:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to create API key' },
            { status: 500 }
        );
    }
}
