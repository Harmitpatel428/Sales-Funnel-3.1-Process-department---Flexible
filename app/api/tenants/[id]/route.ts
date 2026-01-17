import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { addServerAuditLog } from '@/app/actions/audit';
import type { TenantOperationResponse, TenantResponse, UpdateTenantRequest } from '../types';

/**
 * Helper to check if user is SUPER_ADMIN
 */
async function requireSuperAdmin() {
    const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (!session) {
        return { authorized: false, error: 'Unauthorized', status: 401 };
    }

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { role: true, name: true },
    });

    if (user?.role !== 'SUPER_ADMIN') {
        return { authorized: false, error: 'Forbidden: Super Admin access required', status: 403 };
    }

    return { authorized: true, session, userName: user.name };
}

/**
 * Format tenant for API response
 */
function formatTenant(tenant: {
    id: string;
    name: string;
    subdomain: string | null;
    slug: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    brandingConfig: string;
    features: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}): TenantResponse {
    return {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        slug: tenant.slug,
        subscriptionTier: tenant.subscriptionTier,
        subscriptionStatus: tenant.subscriptionStatus,
        brandingConfig: JSON.parse(tenant.brandingConfig),
        features: JSON.parse(tenant.features),
        isActive: tenant.isActive,
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt.toISOString(),
    };
}

interface RouteContext {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/tenants/[id]
 * Get a single tenant by ID (SUPER_ADMIN only)
 */
export async function GET(
    _request: NextRequest,
    context: RouteContext
): Promise<NextResponse<TenantOperationResponse>> {
    try {
        const auth = await requireSuperAdmin();
        if (!auth.authorized) {
            return NextResponse.json(
                { success: false, message: auth.error },
                { status: auth.status }
            );
        }

        const { id } = await context.params;

        const tenant = await prisma.tenant.findUnique({
            where: { id },
        });

        if (!tenant) {
            return NextResponse.json(
                { success: false, message: 'Tenant not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            tenant: formatTenant(tenant),
        });
    } catch (error) {
        console.error('GET /api/tenants/[id] error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch tenant' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/tenants/[id]
 * Update a tenant (SUPER_ADMIN only)
 */
export async function PUT(
    request: NextRequest,
    context: RouteContext
): Promise<NextResponse<TenantOperationResponse>> {
    try {
        const auth = await requireSuperAdmin();
        if (!auth.authorized) {
            return NextResponse.json(
                { success: false, message: auth.error },
                { status: auth.status }
            );
        }

        const { id } = await context.params;
        const body: UpdateTenantRequest = await request.json();

        // Check if tenant exists
        const existingTenant = await prisma.tenant.findUnique({
            where: { id },
        });

        if (!existingTenant) {
            return NextResponse.json(
                { success: false, message: 'Tenant not found' },
                { status: 404 }
            );
        }

        // Build update data
        const updateData: Record<string, unknown> = {};
        if (body.name !== undefined) updateData.name = body.name;
        if (body.subdomain !== undefined) updateData.subdomain = body.subdomain;
        if (body.subscriptionTier !== undefined) updateData.subscriptionTier = body.subscriptionTier;
        if (body.subscriptionStatus !== undefined) updateData.subscriptionStatus = body.subscriptionStatus;
        if (body.brandingConfig !== undefined) updateData.brandingConfig = JSON.stringify(body.brandingConfig);
        if (body.features !== undefined) updateData.features = JSON.stringify(body.features);
        if (body.customFields !== undefined) updateData.customFields = JSON.stringify(body.customFields);
        if (body.workflowSettings !== undefined) updateData.workflowSettings = JSON.stringify(body.workflowSettings);
        if (body.isActive !== undefined) updateData.isActive = body.isActive;

        const tenant = await prisma.tenant.update({
            where: { id },
            data: updateData,
        });

        await addServerAuditLog({
            actionType: 'TENANT_UPDATED',
            entityType: 'tenant',
            entityId: id,
            performedById: auth.session!.userId,
            performedByName: auth.userName,
            description: `Updated tenant: ${tenant.name}`,
            metadata: { tenantId: id, updates: Object.keys(body) },
        });

        return NextResponse.json({
            success: true,
            message: 'Tenant updated successfully',
            tenant: formatTenant(tenant),
        });
    } catch (error) {
        console.error('PUT /api/tenants/[id] error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to update tenant' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/tenants/[id]
 * Soft delete (deactivate) a tenant (SUPER_ADMIN only)
 */
export async function DELETE(
    _request: NextRequest,
    context: RouteContext
): Promise<NextResponse<TenantOperationResponse>> {
    try {
        const auth = await requireSuperAdmin();
        if (!auth.authorized) {
            return NextResponse.json(
                { success: false, message: auth.error },
                { status: auth.status }
            );
        }

        const { id } = await context.params;

        // Check if tenant exists
        const existingTenant = await prisma.tenant.findUnique({
            where: { id },
        });

        if (!existingTenant) {
            return NextResponse.json(
                { success: false, message: 'Tenant not found' },
                { status: 404 }
            );
        }

        // Soft delete - just deactivate
        const tenant = await prisma.tenant.update({
            where: { id },
            data: { isActive: false },
        });

        await addServerAuditLog({
            actionType: 'TENANT_DELETED',
            entityType: 'tenant',
            entityId: id,
            performedById: auth.session!.userId,
            performedByName: auth.userName,
            description: `Deactivated tenant: ${tenant.name}`,
            metadata: { tenantId: id, tenantName: tenant.name },
        });

        return NextResponse.json({
            success: true,
            message: 'Tenant deactivated successfully',
        });
    } catch (error) {
        console.error('DELETE /api/tenants/[id] error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to delete tenant' },
            { status: 500 }
        );
    }
}
