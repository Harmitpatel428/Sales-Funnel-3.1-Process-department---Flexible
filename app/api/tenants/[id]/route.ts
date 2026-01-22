import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { addServerAuditLog } from '@/app/actions/audit';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
    forbiddenResponse,
    notFoundResponse,
} from '@/lib/api/withApiHandler';
import type { TenantOperationResponse, TenantResponse, UpdateTenantRequest } from '../types';

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

/**
 * Helper to check if user is SUPER_ADMIN
 */
async function checkSuperAdmin(session: { userId: string }) {
    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { role: true, name: true },
    });

    if (user?.role !== 'SUPER_ADMIN') {
        return { authorized: false as const, user };
    }

    return { authorized: true as const, user };
}

/**
 * GET /api/tenants/[id]
 * Get a single tenant by ID (SUPER_ADMIN only)
 */
export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (_req: NextRequest, context: ApiContext): Promise<NextResponse<TenantOperationResponse>> => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse() as NextResponse<TenantOperationResponse>;
        }

        const { authorized } = await checkSuperAdmin(session);
        if (!authorized) {
            return forbiddenResponse('Super Admin access required') as NextResponse<TenantOperationResponse>;
        }

        const { id } = await params;

        const tenant = await prisma.tenant.findUnique({
            where: { id },
        });

        if (!tenant) {
            return notFoundResponse('Tenant') as NextResponse<TenantOperationResponse>;
        }

        return NextResponse.json({
            success: true,
            tenant: formatTenant(tenant),
        });
    }
);

/**
 * PUT /api/tenants/[id]
 * Update a tenant (SUPER_ADMIN only)
 */
export const PUT = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context: ApiContext): Promise<NextResponse<TenantOperationResponse>> => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse() as NextResponse<TenantOperationResponse>;
        }

        const { authorized, user } = await checkSuperAdmin(session);
        if (!authorized) {
            return forbiddenResponse('Super Admin access required') as NextResponse<TenantOperationResponse>;
        }

        const { id } = await params;
        const body: UpdateTenantRequest = await req.json();

        // Check if tenant exists
        const existingTenant = await prisma.tenant.findUnique({
            where: { id },
        });

        if (!existingTenant) {
            return notFoundResponse('Tenant') as NextResponse<TenantOperationResponse>;
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
            performedById: session.userId,
            performedByName: user?.name,
            description: `Updated tenant: ${tenant.name}`,
            metadata: { tenantId: id, updates: Object.keys(body) },
        });

        return NextResponse.json({
            success: true,
            message: 'Tenant updated successfully',
            tenant: formatTenant(tenant),
        });
    }
);

/**
 * DELETE /api/tenants/[id]
 * Soft delete (deactivate) a tenant (SUPER_ADMIN only)
 */
export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (_req: NextRequest, context: ApiContext): Promise<NextResponse<TenantOperationResponse>> => {
        const { session, params } = context;

        if (!session) {
            return unauthorizedResponse() as NextResponse<TenantOperationResponse>;
        }

        const { authorized, user } = await checkSuperAdmin(session);
        if (!authorized) {
            return forbiddenResponse('Super Admin access required') as NextResponse<TenantOperationResponse>;
        }

        const { id } = await params;

        // Check if tenant exists
        const existingTenant = await prisma.tenant.findUnique({
            where: { id },
        });

        if (!existingTenant) {
            return notFoundResponse('Tenant') as NextResponse<TenantOperationResponse>;
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
            performedById: session.userId,
            performedByName: user?.name,
            description: `Deactivated tenant: ${tenant.name}`,
            metadata: { tenantId: id, tenantName: tenant.name },
        });

        return NextResponse.json({
            success: true,
            message: 'Tenant deactivated successfully',
        });
    }
);
