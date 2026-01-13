'use server';

import { prisma } from '@/lib/db';
import {
    hashPassword,
    verifyPassword,
    createSession,
    invalidateSession,
    getSession,
    isAccountLocked,
    recordFailedLoginAttempt,
    resetFailedLoginAttempts,
} from '@/lib/auth';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { addServerAuditLog } from './audit';
import { headers } from 'next/headers';

// ============================================================================
// AUTH SERVER ACTIONS
// ============================================================================

export interface AuthResult {
    success: boolean;
    message: string;
    mfaRequired?: boolean;
    user?: {
        userId: string;
        username: string;
        name: string;
        email: string;
        role: string;
        permissions?: string[];
    };
}

/**
 * Server action to log in a user.
 */
export async function loginAction(username: string, password: string, rememberMe: boolean = false): Promise<AuthResult> {
    try {
        const headersList = await headers();
        const userAgent = headersList.get('user-agent') || undefined;
        const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || undefined;

        // Find user by username or email
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: username.toLowerCase() },
                    { email: username.toLowerCase() }
                ]
            }
        });

        if (!user) {
            console.log(`Debug: User not found for username/email: ${username}`);
            // Security: Reset to generic message in production
            return { success: false, message: `Debug: User not found for ${username}` };
        }

        // Check if account is active
        if (!user.isActive) {
            return { success: false, message: 'Your account has been deactivated' };
        }

        // Check if account is locked
        if (await isAccountLocked(user.id)) {
            return { success: false, message: 'Account is locked due to too many failed attempts.' };
        }

        // Verify password
        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
            console.log(`Debug: Password mismatch for user: ${user.username}`);
            // Security: Reset to generic message in production
            return { success: false, message: 'Debug: Invalid password' };
        }

        // Reset failed attempts and create session
        await resetFailedLoginAttempts(user.id);
        await createSession(user.id, user.role, user.tenantId, userAgent, ipAddress, rememberMe);

        return {
            success: true,
            message: 'Login successful',
            user: {
                userId: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
                permissions: Array.from(await getUserPermissions(user.id)),
            },
        };
    } catch (error: any) {
        console.error('Login error:', error);
        return { success: false, message: `Debug: Login Error - ${error.message}` };
    }
}

/**
 * Server action to log out the current user.
 */
export async function logoutAction(): Promise<{ success: boolean }> {
    try {
        const session = await getSession();

        if (session) {
            const user = await prisma.user.findUnique({ where: { id: session.userId } });
            const headersList = await headers();

            await addServerAuditLog({
                actionType: 'USER_LOGOUT',
                entityType: 'user',
                entityId: session.userId,
                performedById: session.userId,
                performedByName: user?.name || 'Unknown',
                description: `User "${user?.name || 'Unknown'}" logged out`,
                sessionId: session.sessionId,
                ipAddress: headersList.get('x-forwarded-for') || undefined,
                userAgent: headersList.get('user-agent') || undefined,
            });
        }

        await invalidateSession();
        return { success: true };
    } catch (error) {
        console.error('Logout error:', error);
        return { success: false };
    }
}

/**
 * Server action to get the current authenticated user.
 */
export async function getCurrentUser(): Promise<AuthResult['user'] | null> {
    try {
        const session = await getSession();
        if (!session) {
            return null;
        }

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: {
                id: true,
                username: true,
                name: true,
                email: true, // Required for AuthResult
                role: true,
                isActive: true,
                roleId: true, // Fetch roleId
                customRole: { // Fetch custom role details
                    select: {
                        id: true,
                        name: true,
                    }
                },
                mfaEnabled: true,
                ssoProvider: true
            },
        });

        if (!user || !user.isActive) {
            return null;
        }

        return {
            userId: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            permissions: Array.from(await getUserPermissions(user.id)),
        };
    } catch (error) {
        console.error('Get current user error:', error);
        return null;
    }
}

/**
 * Check if the current user has any of the specified roles.
 */
export async function checkRole(allowedRoles: string[]): Promise<boolean> {
    const session = await getSession();
    if (!session) {
        return false;
    }
    return allowedRoles.includes(session.role);
}

/**
 * Require authentication - throws if not authenticated.
 */
export async function requireAuth(): Promise<{ userId: string; role: string; sessionId: string }> {
    const session = await getSession();
    if (!session) {
        throw new Error('Unauthorized: You must be logged in to perform this action');
    }
    return session;
}

/**
 * Require specific role - throws if not authorized.
 */
export async function requireRole(allowedRoles: string[]): Promise<{ userId: string; role: string; sessionId: string }> {
    const session = await requireAuth();
    if (!allowedRoles.includes(session.role)) {
        throw new Error('Forbidden: You do not have permission to perform this action');
    }
    return session;
}
