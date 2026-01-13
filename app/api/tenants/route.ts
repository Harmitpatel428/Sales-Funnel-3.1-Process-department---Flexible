import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { addServerAuditLog } from '@/app/actions/audit';
import type { ListTenantsResponse, TenantOperationResponse, TenantResponse, CreateTenantRequest } from './types';

/**
 * Helper to check if user is SUPER_ADMIN
 */
async function requireSuperAdmin() {
    const session = await getSession();
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

/**
 * GET /api/tenants
 * List all tenants (SUPER_ADMIN only)
 */
export async function GET(): Promise<NextResponse<ListTenantsResponse>> {
    try {
        const auth = await requireSuperAdmin();
        if (!auth.authorized) {
            return NextResponse.json(
                { success: false, message: auth.error },
                { status: auth.status }
            );
        }

        const tenants = await prisma.tenant.findMany({
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({
            success: true,
            tenants: tenants.map(formatTenant),
        });
    } catch (error) {
        console.error('GET /api/tenants error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch tenants' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/tenants
 * Create a new tenant (SUPER_ADMIN only)
 */
export async function POST(request: NextRequest): Promise<NextResponse<TenantOperationResponse>> {
    try {
        const auth = await requireSuperAdmin();
        if (!auth.authorized) {
            return NextResponse.json(
                { success: false, message: auth.error },
                { status: auth.status }
            );
        }

        const body: CreateTenantRequest = await request.json();

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

        await addServerAuditLog({
            actionType: 'TENANT_CREATED',
            entityType: 'tenant',
            entityId: tenant.id,
            performedById: auth.session!.userId,
            performedByName: auth.userName,
            description: `Created tenant: ${tenant.name}`,
            metadata: { tenantId: tenant.id, tenantName: tenant.name },
        });

        return NextResponse.json({
            success: true,
            message: 'Tenant created successfully',
            tenantId: tenant.id,
            tenant: formatTenant(tenant),
        }, { status: 201 });
    } catch (error) {
        console.error('POST /api/tenants error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to create tenant' },
            { status: 500 }
        );
    }
}
