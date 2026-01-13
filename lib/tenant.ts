import { prisma } from './db';

/**
 * Executes a callback within a specific tenant context.
 * Useful for ensuring operations are scoped to a tenant (though DB schema enforces tenantId).
 * Can be extended to set AsyncLocalStorage context if needed for Prisma middleware.
 */
export async function withTenant<T>(tenantId: string, callback: () => Promise<T>): Promise<T> {
    // Verify tenant exists and is active (optional, cached check would be better)
    // For performance, we might skip this for every read if not strictly required, 
    // but strictly safer to check.

    // const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    // if (!tenant || !tenant.isActive) {
    //   throw new Error('Tenant is inactive or not found');
    // }

    // For now, simple pass-through. 
    // If we had AsyncLocalStorage for implicit tenant filtering, we'd wrap it here.
    return callback();
}
