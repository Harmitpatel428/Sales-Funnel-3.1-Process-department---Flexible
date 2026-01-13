'use server';

import {
    getFieldPermissions,
    getUserPermissions
} from '@/lib/middleware/permissions';
import { getSession } from '@/lib/auth';

/**
 * Server action to get field-level permissions for a specific resource
 */
export async function getFieldPermissionsAction(resource: string) {
    const session = await getSession();
    if (!session) {
        return { canView: [], canEdit: [] };
    }

    return await getFieldPermissions(session.userId, resource);
}

/**
 * Server action to get all permissions for the current user
 * Useful if we need to refresh permissions without full re-login
 */
export async function getUserPermissionsAction() {
    const session = await getSession();
    if (!session) {
        return [];
    }

    const perms = await getUserPermissions(session.userId);
    return Array.from(perms);
}
