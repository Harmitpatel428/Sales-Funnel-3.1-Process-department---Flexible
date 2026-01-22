import { NextRequest, NextResponse } from 'next/server';
import { revokeApiKey, rotateApiKey, getApiKeyUsageStats, API_SCOPES } from '@/lib/api-keys';
import { prisma } from '@/lib/db';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';

/**
 * GET /api/api-keys/[id]
 * Get a specific API key
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const includeStats = searchParams.get('includeStats') === 'true';
        const statsDays = parseInt(searchParams.get('statsDays') || '30');

        const apiKey = await prisma.apiKey.findFirst({
            where: { id, tenantId: session.tenantId },
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
                updatedAt: true,
                environment: true,
                description: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!apiKey) {
            return notFoundResponse('API key');
        }

        let stats = null;
        if (includeStats) {
            stats = await getApiKeyUsageStats(apiKey.id, statsDays);
        }

        return NextResponse.json({
            success: true,
            data: {
                ...apiKey,
                scopes: JSON.parse(apiKey.scopes),
                stats,
            },
        });
    }
);

/**
 * PATCH /api/api-keys/[id]
 * Update an API key
 */
export const PATCH = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const body = await req.json();
        const { name, scopes, rateLimit, isActive, expiresAt, description } = body;

        // Check if API key exists and belongs to tenant
        const existingKey = await prisma.apiKey.findFirst({
            where: { id, tenantId: session.tenantId },
        });

        if (!existingKey) {
            return notFoundResponse('API key');
        }

        // Build update data
        const updateData: any = {};

        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim().length === 0) {
                return NextResponse.json(
                    { success: false, message: 'Invalid name' },
                    { status: 400 }
                );
            }
            updateData.name = name.trim();
        }

        if (scopes !== undefined) {
            if (!Array.isArray(scopes) || scopes.length === 0) {
                return NextResponse.json(
                    { success: false, message: 'At least one scope is required' },
                    { status: 400 }
                );
            }
            const validScopes = Object.values(API_SCOPES);
            const invalidScopes = scopes.filter((s: string) => !validScopes.includes(s as any));
            if (invalidScopes.length > 0) {
                return NextResponse.json(
                    { success: false, message: `Invalid scopes: ${invalidScopes.join(', ')}` },
                    { status: 400 }
                );
            }
            updateData.scopes = JSON.stringify(scopes);
        }

        if (rateLimit !== undefined) {
            if (typeof rateLimit !== 'number' || rateLimit < 1) {
                return NextResponse.json(
                    { success: false, message: 'Rate limit must be a positive number' },
                    { status: 400 }
                );
            }
            updateData.rateLimit = rateLimit;
        }

        if (isActive !== undefined) {
            updateData.isActive = Boolean(isActive);
        }

        if (expiresAt !== undefined) {
            updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
        }

        if (description !== undefined) {
            updateData.description = description;
        }

        const updatedKey = await prisma.apiKey.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                scopes: true,
                rateLimit: true,
                isActive: true,
                expiresAt: true,
                lastUsedAt: true,
                updatedAt: true,
                environment: true,
                description: true,
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                ...updatedKey,
                scopes: JSON.parse(updatedKey.scopes),
            },
            message: 'API key updated successfully',
        });
    }
);

/**
 * DELETE /api/api-keys/[id]
 * Revoke/delete an API key
 */
export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true },
    async (req: NextRequest, context: ApiContext) => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse();
        }

        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const hardDelete = searchParams.get('hardDelete') === 'true';

        // Check if API key exists and belongs to tenant
        const existingKey = await prisma.apiKey.findFirst({
            where: { id, tenantId: session.tenantId },
        });

        if (!existingKey) {
            return notFoundResponse('API key');
        }

        if (hardDelete) {
            // Permanently delete the key
            await prisma.apiKey.delete({
                where: { id },
            });
            return NextResponse.json({
                success: true,
                message: 'API key permanently deleted',
            });
        } else {
            // Soft revoke - just mark as inactive
            const revoked = await revokeApiKey(id, session.tenantId);
            if (!revoked) {
                return NextResponse.json(
                    { success: false, message: 'Failed to revoke API key' },
                    { status: 500 }
                );
            }
            return NextResponse.json({
                success: true,
                message: 'API key revoked successfully',
            });
        }
    }
);
