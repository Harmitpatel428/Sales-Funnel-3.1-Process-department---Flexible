import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { addServerAuditLog } from '@/app/actions/audit';
import {
    withApiHandler,
    ApiContext,
    unauthorizedResponse,
} from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';
import type { ListTenantsResponse, TenantOperationResponse, TenantResponse, CreateTenantRequest } from './types';

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
 * GET /api/tenants
 * List all tenants (SUPER_ADMIN only)
 */
export const GET = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        rateLimit: 100,
        permissions: [PERMISSIONS.SETTINGS_MANAGE_TENANTS],
        skipTenantCheck: true
    },
    async (_req: NextRequest, _context: ApiContext): Promise<NextResponse<ListTenantsResponse>> => {
        const tenants = await prisma.tenant.findMany({
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({
            success: true,
            tenants: tenants.map(formatTenant),
        });
    }
);

/**
 * POST /api/tenants
 * Create a new tenant (SUPER_ADMIN only)
 */
export const POST = withApiHandler(
    {
        authRequired: true,
        checkDbHealth: true,
        rateLimit: 100,
        permissions: [PERMISSIONS.SETTINGS_MANAGE_TENANTS],
        skipTenantCheck: true
    },
    async (req: NextRequest, context: ApiContext): Promise<NextResponse<TenantOperationResponse>> => {
        const { session } = context;

        if (!session) {
            return unauthorizedResponse() as NextResponse<TenantOperationResponse>;
        }

        const body: CreateTenantRequest = await req.json();

        // Validate required fields
        if (!body.name || !body.slug) {
            return NextResponse.json(
                { success: false, message: 'Name and slug are required' },
                { status: 400 }
            );
        }

        // Check for duplicate slug
        const existingSlug = await prisma.tenant.findUnique({
            where: { slug: body.slug },
        });
        if (existingSlug) {
            return NextResponse.json(
                { success: false, message: 'Slug already exists' },
                { status: 409 }
            );
        }

        // Check for duplicate subdomain if provided
        if (body.subdomain) {
            const existingSubdomain = await prisma.tenant.findUnique({
                where: { subdomain: body.subdomain },
            });
            if (existingSubdomain) {
                return NextResponse.json(
                    { success: false, message: 'Subdomain already exists' },
                    { status: 409 }
                );
            }
        }

        const tenant = await prisma.tenant.create({
            data: {
                name: body.name,
                subdomain: body.subdomain,
                slug: body.slug,
                subscriptionTier: body.subscriptionTier || 'FREE',
                subscriptionStatus: 'ACTIVE',
            },
        });

        // Get user name for audit log
        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { name: true },
        });

        await addServerAuditLog({
            actionType: 'TENANT_CREATED',
            entityType: 'tenant',
            entityId: tenant.id,
            performedById: session.userId,
            performedByName: user?.name || 'Unknown',
            description: `Created tenant: ${tenant.name}`,
            metadata: { tenantId: tenant.id, tenantName: tenant.name },
        });

        return NextResponse.json({
            success: true,
            message: 'Tenant created successfully',
            tenantId: tenant.id,
            tenant: formatTenant(tenant),
        }, { status: 201 });
    }
);
