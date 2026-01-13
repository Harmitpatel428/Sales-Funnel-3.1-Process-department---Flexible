import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@/app/types/permissions';

const prisma = new PrismaClient();

/**
 * Checks if a user has the required permissions via their roles.
 * @param userId The ID of the user to check.
 * @param requiredPermissions An array of permission keys (e.g., 'email.view').
 * @returns true if the user has ALL required permissions (or is an ADMIN/System role that overrides).
 */
export async function requirePermissions(userId: string, requiredPermissions: string[]): Promise<boolean> {
    if (!userId || requiredPermissions.length === 0) return false;

    // 1. Fetch user with roles and their permissions
    // Note: Schema doesn't have direct User -> Permissions. It has User -> Role (customRole or built-in logic?).
    // User has `role` (string) AND `roleId` (relation to Role).
    // The system seems to support both legacy string role and RBAC Role model.
    // We check both.

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            customRole: {
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    }
                }
            }
        }
    });

    if (!user) return false;

    // Super Admin override (legacy string role)
    if (user.role === 'ADMIN') return true;

    // 2. Collect all permissions the user has
    const userPermissions = new Set<string>();

    // From Custom Role
    if (user.customRole) {
        // Check if role is active?
        if (user.customRole.isActive !== false) {
            user.customRole.permissions.forEach(rp => {
                userPermissions.add(rp.permission.name);
            });
        }
    }

    // Map legacy roles to permissions (fallback if not using dynamic roles exclusively)
    // This is useful if we are transitioning.
    if (user.role === 'SALES_EXECUTIVE') {
        userPermissions.add(PERMISSIONS.LEADS_CREATE);
        userPermissions.add(PERMISSIONS.LEADS_VIEW_ASSIGNED);
        userPermissions.add(PERMISSIONS.EMAIL_VIEW_OWN);
        userPermissions.add(PERMISSIONS.EMAIL_SEND);
        userPermissions.add(PERMISSIONS.CALENDAR_VIEW_OWN);
        userPermissions.add(PERMISSIONS.CALENDAR_CREATE);
    }
    else if (user.role === 'PROCESS_MANAGER') {
        // ... add hardcoded mappings if needed
    }

    // 3. Check if user has ALL required permissions
    return requiredPermissions.every(req => userPermissions.has(req));
}
