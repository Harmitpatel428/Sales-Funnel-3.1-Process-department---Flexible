import { NextRequest, NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { revokeApiKey, rotateApiKey, getApiKeyUsageStats, API_SCOPES } from '@/lib/api-keys';
import { prisma } from '@/lib/db';

// GET /api/api-keys/[id] - Get a specific API key
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
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
            return NextResponse.json(
                { success: false, message: 'API key not found' },
                { status: 404 }
            );
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
    } catch (error: any) {
        console.error('Error fetching API key:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch API key' },
            { status: 500 }
        );
    }
}

// PATCH /api/api-keys/[id] - Update an API key
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { name, scopes, rateLimit, isActive, expiresAt, description } = body;

        // Check if API key exists and belongs to tenant
        const existingKey = await prisma.apiKey.findFirst({
            where: { id, tenantId: session.tenantId },
        });

        if (!existingKey) {
            return NextResponse.json(
                { success: false, message: 'API key not found' },
                { status: 404 }
            );
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
    } catch (error: any) {
        console.error('Error updating API key:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to update API key' },
            { status: 500 }
        );
    }
}

// DELETE /api/api-keys/[id] - Revoke/delete an API key
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const hardDelete = searchParams.get('hardDelete') === 'true';

        // Check if API key exists and belongs to tenant
        const existingKey = await prisma.apiKey.findFirst({
            where: { id, tenantId: session.tenantId },
        });

        if (!existingKey) {
            return NextResponse.json(
                { success: false, message: 'API key not found' },
                { status: 404 }
            );
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
    } catch (error: any) {
        console.error('Error deleting API key:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to delete API key' },
            { status: 500 }
        );
    }
}
