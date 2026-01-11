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
import { addServerAuditLog } from './audit';
import { headers } from 'next/headers';

// ============================================================================
// AUTH SERVER ACTIONS
// ============================================================================

export interface AuthResult {
    success: boolean;
    message: string;
    user?: {
        userId: string;
        username: string;
        name: string;
        email: string;
        role: string;
    };
}

/**
 * Server action to log in a user.
 */
export async function loginAction(username: string, password: string): Promise<AuthResult> {
    try {
        const headersList = await headers();
        const userAgent = headersList.get('user-agent') || undefined;
        const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || undefined;

        // Find user by username
        const user = await prisma.user.findUnique({
            where: { username: username.toLowerCase() },
        });

        if (!user) {
            await addServerAuditLog({
                actionType: 'USER_LOGIN_FAILED',
                entityType: 'user',
                description: `Failed login attempt for username "${username}" - User not found`,
                ipAddress,
                userAgent,
                metadata: { reason: 'user_not_found', attemptedUsername: username },
            });
            return { success: false, message: 'Invalid username or password' };
        }

        // Check if account is active
        if (!user.isActive) {
            await addServerAuditLog({
                actionType: 'USER_LOGIN_FAILED',
                entityType: 'user',
                entityId: user.id,
                performedById: user.id,
                performedByName: user.name,
                description: `Failed login attempt for "${user.name}" - Account deactivated`,
                ipAddress,
                userAgent,
                metadata: { reason: 'account_deactivated' },
            });
            return { success: false, message: 'Your account has been deactivated' };
        }

        // Check if account is locked
        if (await isAccountLocked(user.id)) {
            await addServerAuditLog({
                actionType: 'USER_LOGIN_FAILED',
                entityType: 'user',
                entityId: user.id,
                performedById: user.id,
                performedByName: user.name,
                description: `Failed login attempt for "${user.name}" - Account locked`,
                ipAddress,
                userAgent,
                metadata: { reason: 'account_locked' },
            });
            return { success: false, message: 'Account is locked due to too many failed attempts. Please try again later.' };
        }

        // Verify password
        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
            await recordFailedLoginAttempt(user.id);
            await addServerAuditLog({
                actionType: 'USER_LOGIN_FAILED',
                entityType: 'user',
                entityId: user.id,
                performedById: user.id,
                performedByName: user.name,
                description: `Failed login attempt for "${user.name}" - Invalid password`,
                ipAddress,
                userAgent,
                metadata: { reason: 'invalid_password' },
            });
            return { success: false, message: 'Invalid username or password' };
        }

        // Reset failed attempts and create session
        await resetFailedLoginAttempts(user.id);
        await createSession(user.id, user.role, userAgent, ipAddress);

        // Log successful login
        await addServerAuditLog({
            actionType: 'USER_LOGIN',
            entityType: 'user',
            entityId: user.id,
            performedById: user.id,
            performedByName: user.name,
            description: `User "${user.name}" logged in successfully`,
            ipAddress,
            userAgent,
            metadata: { role: user.role, loginMethod: 'password' },
        });

        return {
            success: true,
            message: 'Login successful',
            user: {
                userId: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, message: 'An error occurred during login' };
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
                email: true,
                role: true,
                isActive: true,
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
