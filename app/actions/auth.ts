'use server';

import { prisma } from '@/lib/db';
import {
    hashPassword,
    verifyPassword,
    createSession,
    invalidateSessionByToken,
    getSessionByToken,
    isAccountLocked,
    recordFailedLoginAttempt,
    resetFailedLoginAttempts,
} from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { addServerAuditLog } from './audit';
import { headers, cookies } from 'next/headers';

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
        roleId?: string | null;
        customRole?: { id: string; name: string } | null;
        mfaEnabled?: boolean;
        ssoProvider?: 'google' | 'microsoft' | 'saml' | null;
        lastLoginAt?: string;
    };
}

/**
 * Server action to log in a user.
 * 
 * @deprecated CRITICAL: This server action MUST NOT be used for browser-based login.
 * Browser login MUST use POST /api/auth/login API route.
 * 
 * This function is retained ONLY for:
 * - Server-side authentication flows (non-browser)
 * - CLI tools, background jobs, server-to-server auth
 * - Backward compatibility with legacy integrations
 * 
 * ARCHITECTURAL RULE: Server actions cannot set HTTP-only cookies in browser
 * contexts. Only API routes using NextResponse.cookies.set() can.
 * 
 * Server actions may READ cookies but must NEVER mutate authentication cookies.
 * 
 * @see /app/api/auth/login/route.ts for the correct browser login implementation
 * @see /lib/auth.ts for architectural rules
 * @see /lib/authCookies.ts for API-layer cookie helpers
 *
 * @param username - Username or email
 * @param password - User password
 * @param rememberMe - Whether to extend session duration
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
            },
            include: { // Include custom role to get role name
                customRole: {
                    select: { id: true, name: true }
                }
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
                // Add extended fields
                roleId: user.roleId,
                customRole: user.customRole,
                mfaEnabled: user.mfaEnabled,
                ssoProvider: user.ssoProvider as any,
                lastLoginAt: new Date().toISOString() // Just logged in
            },
        };
    } catch (error: any) {
        console.error('Login error:', error);
        return { success: false, message: `Debug: Login Error - ${error.message}` };
    }
}

/**
 * Server action to log out the current user.
 *
 * @deprecated CRITICAL: This server action MUST NOT be used for browser-based logout.
 * Browser logout MUST use POST /api/auth/logout API route.
 * 
 * This function is retained ONLY for:
 * - Server-side logout flows (non-browser)
 * - CLI tools, background jobs, server-to-server auth
 * - Backward compatibility with legacy integrations
 * 
 * ARCHITECTURAL RULE: Server actions cannot delete HTTP-only cookies in browser
 * contexts. Only API routes using NextResponse.cookies.delete() can.
 * 
 * Server actions may READ cookies but must NEVER mutate authentication cookies.
 * 
 * @see /app/api/auth/logout/route.ts for the correct browser logout implementation
 * @see /lib/auth.ts for architectural rules
 */
export async function logoutAction(): Promise<{ success: boolean }> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        const session = await getSessionByToken(token);

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

        await invalidateSessionByToken(token);
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
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        const session = await getSessionByToken(token);

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
                ssoProvider: true,
                lastLoginAt: true // Fetch last login
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
            roleId: user.roleId,
            customRole: user.customRole,
            mfaEnabled: user.mfaEnabled,
            ssoProvider: user.ssoProvider as any,
            lastLoginAt: user.lastLoginAt?.toISOString()
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
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = await getSessionByToken(token);

    if (!session) {
        return false;
    }
    return allowedRoles.includes(session.role);
}

/**
 * Require authentication - throws if not authenticated.
 */
export async function requireAuth(): Promise<{ userId: string; role: string; sessionId: string }> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = await getSessionByToken(token);

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
