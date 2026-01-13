'use server';

import { prisma } from '@/lib/db';
import { requireAuth } from './auth';
import { addServerAuditLog } from './audit';
import { cookies } from 'next/headers';

const TENANT_COOKIE_NAME = 'active_tenant_id';

// Get tenant for current user
export async function getTenantForUser() {
    try {
        const { getSession } = await import('@/lib/auth');
        const session = await getSession();

        if (!session) {
            return { success: false, message: 'Not authenticated' };
        }

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            include: { tenant: true },
        });

        if (!user || !user.tenant) {
            return { success: false, message: 'No tenant found' };
        }

        const isSuperAdmin = user.role === 'SUPER_ADMIN';

        // For super-admin, check if they have a tenant override in cookie
        let activeTenant = user.tenant;
        if (isSuperAdmin) {
            const cookieStore = await cookies();
            const overrideTenantId = cookieStore.get(TENANT_COOKIE_NAME)?.value;

            if (overrideTenantId) {
                const overrideTenant = await prisma.tenant.findUnique({
                    where: { id: overrideTenantId },
                });
                if (overrideTenant) {
                    activeTenant = overrideTenant;
                }
            }
        }

        return {
            success: true,
            tenant: {
                id: activeTenant.id,
                name: activeTenant.name,
                subdomain: activeTenant.subdomain,
                slug: activeTenant.slug,
                subscriptionTier: activeTenant.subscriptionTier,
                subscriptionStatus: activeTenant.subscriptionStatus,
                brandingConfig: JSON.parse(activeTenant.brandingConfig),
                features: JSON.parse(activeTenant.features),
                isActive: activeTenant.isActive,
            },
            isSuperAdmin,
        };
    } catch (error) {
        console.error('Get tenant error:', error);
        return { success: false, message: 'Failed to get tenant' };
    }
}

// Get all tenants (super-admin only)
export async function getTenants() {
    try {
        const session = await requireAuth();

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (user?.role !== 'SUPER_ADMIN') {
            return { success: false, message: 'Unauthorized' };
        }

        const tenants = await prisma.tenant.findMany({
            orderBy: { name: 'asc' },
        });

        return {
            success: true,
            tenants: tenants.map(t => ({
                id: t.id,
                name: t.name,
                subdomain: t.subdomain,
                slug: t.slug,
                subscriptionTier: t.subscriptionTier,
                subscriptionStatus: t.subscriptionStatus,
                brandingConfig: JSON.parse(t.brandingConfig),
                features: JSON.parse(t.features),
                isActive: t.isActive,
            })),
        };
    } catch (error) {
        console.error('Get tenants error:', error);
        return { success: false, message: 'Failed to get tenants' };
    }
}

// Switch tenant (super-admin only)
export async function switchTenant(tenantId: string) {
    try {
        const session = await requireAuth();

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (user?.role !== 'SUPER_ADMIN') {
            return { success: false, message: 'Unauthorized' };
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
        });

        if (!tenant) {
            return { success: false, message: 'Tenant not found' };
        }

        // Set tenant override cookie
        const cookieStore = await cookies();
        cookieStore.set(TENANT_COOKIE_NAME, tenantId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        await addServerAuditLog({
            actionType: 'TENANT_SWITCHED',
            entityType: 'tenant',
            entityId: tenantId,
            performedById: session.userId,
            performedByName: user.name,
            description: `Super-admin switched to tenant: ${tenant.name}`,
            metadata: { tenantId, tenantName: tenant.name },
        });

        return { success: true, message: `Switched to ${tenant.name}` };
    } catch (error) {
        console.error('Switch tenant error:', error);
        return { success: false, message: 'Failed to switch tenant' };
    }
}

// Create tenant (super-admin only)
export async function createTenant(data: {
    name: string;
    subdomain?: string;
    slug: string;
    subscriptionTier?: string;
}) {
    try {
        const session = await requireAuth();

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (user?.role !== 'SUPER_ADMIN') {
            return { success: false, message: 'Unauthorized' };
        }

        const tenant = await prisma.tenant.create({
            data: {
                name: data.name,
                subdomain: data.subdomain,
                slug: data.slug,
                subscriptionTier: data.subscriptionTier || 'FREE',
                subscriptionStatus: 'ACTIVE',
            },
        });

        await addServerAuditLog({
            actionType: 'TENANT_CREATED',
            entityType: 'tenant',
            entityId: tenant.id,
            performedById: session.userId,
            performedByName: user.name,
            description: `Created tenant: ${tenant.name}`,
            metadata: { tenantId: tenant.id, tenantName: tenant.name },
        });

        return { success: true, message: 'Tenant created successfully', tenantId: tenant.id };
    } catch (error) {
        console.error('Create tenant error:', error);
        return { success: false, message: 'Failed to create tenant' };
    }
}

// Update tenant (super-admin only)
export async function updateTenant(tenantId: string, updates: {
    name?: string;
    subdomain?: string;
    subscriptionTier?: string;
    subscriptionStatus?: string;
    brandingConfig?: Record<string, unknown>;
    features?: Record<string, unknown>;
    customFields?: Record<string, unknown>;
    workflowSettings?: Record<string, unknown>;
    isActive?: boolean;
}) {
    try {
        const session = await requireAuth();

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (user?.role !== 'SUPER_ADMIN') {
            return { success: false, message: 'Unauthorized' };
        }

        const updateData: Record<string, unknown> = {};
        if (updates.name) updateData.name = updates.name;
        if (updates.subdomain !== undefined) updateData.subdomain = updates.subdomain;
        if (updates.subscriptionTier) updateData.subscriptionTier = updates.subscriptionTier;
        if (updates.subscriptionStatus) updateData.subscriptionStatus = updates.subscriptionStatus;
        if (updates.brandingConfig) updateData.brandingConfig = JSON.stringify(updates.brandingConfig);
        if (updates.features) updateData.features = JSON.stringify(updates.features);
        if (updates.customFields) updateData.customFields = JSON.stringify(updates.customFields);
        if (updates.workflowSettings) updateData.workflowSettings = JSON.stringify(updates.workflowSettings);
        if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData,
        });

        await addServerAuditLog({
            actionType: 'TENANT_UPDATED',
            entityType: 'tenant',
            entityId: tenantId,
            performedById: session.userId,
            performedByName: user.name,
            description: `Updated tenant: ${tenant.name}`,
            metadata: { tenantId, updates: Object.keys(updates) },
        });

        return { success: true, message: 'Tenant updated successfully' };
    } catch (error) {
        console.error('Update tenant error:', error);
        return { success: false, message: 'Failed to update tenant' };
    }
}

// Delete tenant (super-admin only) - soft delete
export async function deleteTenant(tenantId: string) {
    try {
        const session = await requireAuth();

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (user?.role !== 'SUPER_ADMIN') {
            return { success: false, message: 'Unauthorized' };
        }

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: { isActive: false },
        });

        await addServerAuditLog({
            actionType: 'TENANT_DELETED',
            entityType: 'tenant',
            entityId: tenantId,
            performedById: session.userId,
            performedByName: user.name,
            description: `Deactivated tenant: ${tenant.name}`,
            metadata: { tenantId, tenantName: tenant.name },
        });

        return { success: true, message: 'Tenant deactivated successfully' };
    } catch (error) {
        console.error('Delete tenant error:', error);
        return { success: false, message: 'Failed to delete tenant' };
    }
}
