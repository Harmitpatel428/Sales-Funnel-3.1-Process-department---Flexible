import { NextRequest, NextResponse } from 'next/server';
import { generateApiKey, API_SCOPES, SCOPE_DESCRIPTIONS } from '@/lib/api-keys';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';

/**
 * GET /api/api-keys
 * List all API keys for the tenant
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_VIEW]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
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
    }
);

/**
 * POST /api/api-keys
 * Create a new API key
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        permissions: [PERMISSIONS.SETTINGS_EDIT]
    },
    async (req: NextRequest, context: ApiContext) => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse();
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
    }
);
