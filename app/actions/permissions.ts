'use server';

import {
    getFieldPermissions,
    getUserPermissions
} from '@/lib/middleware/permissions';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { cookies } from 'next/headers';

/**
 * Server action to get field-level permissions for a specific resource
 */
export async function getFieldPermissionsAction(resource: string) {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = await getSessionByToken(token);
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
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = await getSessionByToken(token);
    if (!session) {
        return [];
    }

    const perms = await getUserPermissions(session.userId);
    return Array.from(perms);
}
