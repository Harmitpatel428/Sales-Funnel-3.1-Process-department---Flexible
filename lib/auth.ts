import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
// Removed: cookies() is only used in getSession() and invalidateSession() for reading tokens.
// Cookie mutations are handled exclusively by API routes in lib/authCookies.ts
import { prisma } from './db';
import {
    BCRYPT_SALT_ROUNDS,
    SESSION_COOKIE_NAME,
    SESSION_EXPIRY_DAYS,
    JWT_SECRET,
    PASSWORD_MIN_LENGTH,
    PASSWORD_EXPIRY_DAYS,
    PASSWORD_HISTORY_COUNT,
    REMEMBER_ME_EXPIRY_DAYS
} from './authConfig';

// Re-export constants for backward compatibility if needed, 
// though direct import from authConfig is preferred.
export { SESSION_COOKIE_NAME, SESSION_EXPIRY_DAYS, REMEMBER_ME_EXPIRY_DAYS };

// ============================================================================
// PASSWORD UTILITIES
// ============================================================================

// ============================================================================
// PASSWORD UTILITIES
// ============================================================================

/**
 * Hash a password using bcrypt with a salt.
 */
export async function hashPassword(password: string): Promise<string> {
    // Store in history (handled in user update usually, but helper here)
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Check if password has been used recently (History).
 */
export async function checkPasswordHistory(userId: string, password: string): Promise<boolean> {
    const history = await prisma.password_history.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: PASSWORD_HISTORY_COUNT,
    });

    for (const record of history) {
        const match = await bcrypt.compare(password, record.passwordHash);
        if (match) return true; // Used recently
    }
    return false;
}

/**
 * Enforce password expiry check.
 */
export function isPasswordExpired(user: { passwordExpiresAt?: Date | null }): boolean {
    if (!user.passwordExpiresAt) return false;
    return new Date() > user.passwordExpiresAt;
}

/**
 * Verify a password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Validate password strength.
 */
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
    if (password.length < PASSWORD_MIN_LENGTH) {
        return { valid: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!/[!@#$%^&*]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one special character (!@#$%^&*)' };
    }
    return { valid: true, message: 'Password meets requirements' };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
//
// This module contains PURE DOMAIN FUNCTIONS only.
// 
// INVARIANTS (ENFORCED BY ESLINT):
//   1. lib/auth.ts MUST NOT import 'next/headers' or 'next/server'
//   2. lib/auth.ts MUST NOT import lib/authCookies
//   3. Domain functions NEVER mutate cookies
//   4. Domain functions return tokens for callers to manage
//
// DOMAIN FUNCTIONS (this file):
//   - createSession(): Creates session record, returns token
//   - invalidateSessionByToken(): Marks session invalid in DB
//   - rotateSessionTokenByToken(): Creates new session, returns token
//   - getSessionByToken(): Validates session from token string
//
// COOKIE MANAGEMENT (API routes only):
//   - POST /api/auth/login: Calls createSession(), sets cookie via NextResponse
//   - POST /api/auth/logout: Calls invalidateSessionByToken(), deletes cookie via NextResponse
//   - GET /api/auth/me: Retrieves token, calls getSessionByToken() to validate
//
// API-LAYER HELPERS (lib/authCookies.ts):
//   - getSessionCookieOptions(): Configuration for NextResponse.cookies.set()
//   - calculateSessionExpiry(): Expiry date calculation
//   - getSessionTokenFromCookie(): Read-only token retrieval from cookie store
//
// RATIONALE:
//   - Separation of concerns: Domain logic is independent of HTTP mechanics
//   - Testability: Domain functions can be tested without Next.js context
//   - Clarity: Cookie ownership is explicit and centralized in API routes
//   - Safety: ESLint rules prevent regression at build time
//
// ============================================================================

/**
 * Generate a secure session token using JWT.
 */
export async function generateSessionToken(userId: string, role: string): Promise<string> {
    const secret = new TextEncoder().encode(JWT_SECRET);

    const token = await new SignJWT({ userId, role })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_EXPIRY_DAYS}d`)
        .sign(secret);

    return token;
}

/**
 * Verify and decode a session token.
 */
export async function verifySessionToken(token: string): Promise<{ userId: string; role: string } | null> {
    try {
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        return {
            userId: payload.userId as string,
            role: payload.role as string,
        };
    } catch {
        return null;
    }
}


/**
 * Create a new session in the database and return the session token.
 * 
 * PURE DOMAIN FUNCTION: This function manages database state only.
 * It does NOT import or call cookies() or any Next.js server APIs.
 * Cookie management is the exclusive responsibility of API routes.
 * 
 * @param userId - User ID
 * @param role - User role
 * @param tenantId - Tenant ID
 * @param userAgent - Optional user agent string
 * @param ipAddress - Optional IP address
 * @param rememberMe - Whether to extend session duration
 * @returns The session token (to be set as a cookie by the caller)
 */
export async function createSession(
    userId: string,
    role: string,
    tenantId: string,
    userAgent?: string,
    ipAddress?: string,
    rememberMe: boolean = false
): Promise<string> {
    const token = await generateSessionToken(userId, role);
    const expiryDays = rememberMe ? REMEMBER_ME_EXPIRY_DAYS : SESSION_EXPIRY_DAYS;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    // Store session in database
    await prisma.session.create({
        data: {
            userId,
            tenantId,
            token,
            userAgent,
            ipAddress,
            expiresAt,
            rememberMe,
            rememberMeToken: rememberMe ? token : null, // Simple impl: use same token or generating specific one
        },
    });

    return token;
}

/**
 * Get the current session by validating the provided token.
 * 
 * PURE DOMAIN FUNCTION. Does NOT read cookies.
 * Callers must retrieve the token from their execution context (cookies, headers, etc.).
 * 
 * @param token - Session token string
 */
export async function getSessionByToken(token: string | null | undefined): Promise<{
    userId: string;
    role: string;
    sessionId: string;
    tenantId: string;
} | null> {
    if (!token) {
        return null;
    }

    // Verify JWT
    const decoded = await verifySessionToken(token);
    if (!decoded) {
        return null;
    }

    // Check if session exists and is valid in database
    const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
    });

    if (!session || !session.isValid || session.expiresAt < new Date()) {
        return null;
    }

    // Update last activity
    await prisma.session.update({
        where: { id: session.id },
        data: { lastActivityAt: new Date() },
    });

    return {
        userId: session.userId,
        role: session.user.role,
        sessionId: session.id,
        tenantId: session.tenantId,
    };
}

/**
 * Invalidate the session associated with the provided token.
 * 
 * PURE DOMAIN FUNCTION. Does NOT delete cookies.
 * Callers must handle cookie deletion.
 * 
 * @param token - Session token string
 */
export async function invalidateSessionByToken(token: string | null | undefined): Promise<void> {
    if (token) {
        // Mark session as invalid in database
        await prisma.session.updateMany({
            where: { token },
            data: { isValid: false },
        });
    }
}

/**
 * Rotate the session token for security (e.g., after privilege changes).
 * 
 * PURE DOMAIN FUNCTION. Does NOT read or write cookies.
 * returns the new token for the caller to set as a cookie.
 * 
 * @param oldToken - Previous session token
 * @param userId - User ID
 * @returns The new session token (to be set as a cookie by the caller), or null if rotation failed
 */
export async function rotateSessionTokenByToken(oldToken: string | null | undefined, userId: string): Promise<string | null> {
    if (oldToken) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
            // Invalidate old session
            await prisma.session.updateMany({
                where: { token: oldToken },
                data: { isValid: false },
            });

            // Create new session and return token
            const newToken = await createSession(userId, user.role, user.tenantId);
            return newToken;
        }
    }
    return null;
}

// ============================================================================
// ACCOUNT LOCKOUT
// ============================================================================

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Check if a user account is locked.
 */
export async function isAccountLocked(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.lockedUntil) {
        return false;
    }

    if (user.lockedUntil < new Date()) {
        // Lockout expired, reset
        await prisma.user.update({
            where: { id: userId },
            data: { lockedUntil: null, failedLoginAttempts: 0 },
        });
        return false;
    }

    return true;
}

/**
 * Record a failed login attempt.
 */
export async function recordFailedLoginAttempt(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const attempts = user.failedLoginAttempts + 1;
    const updates: { failedLoginAttempts: number; lockedUntil?: Date } = {
        failedLoginAttempts: attempts,
    };

    if (attempts >= MAX_FAILED_ATTEMPTS) {
        updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
    }

    await prisma.user.update({
        where: { id: userId },
        data: updates,
    });
}

/**
 * Reset failed login attempts on successful login.
 */
export async function resetFailedLoginAttempts(userId: string): Promise<void> {
    await prisma.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
}
// ============================================================================
// SSO UTILITIES
// ============================================================================

export interface SSOProfile {
    email: string;
    name?: string;
    image?: string;
    provider: string; // GOOGLE, AZURE_AD, etc.
    providerId: string;
}

/**
 * Handle SSO Login: Find or Create User, then Create Session.
 */
export async function loginWithSSO(profile: SSOProfile, tenantId?: string, userAgent?: string, ipAddress?: string) {
    let user = await prisma.user.findUnique({
        where: { email: profile.email },
    });

    // Auto-provisioning logic
    if (!user) {
        if (!tenantId) {
            throw new Error("Cannot auto-provision SSO user: No explicit tenant context provided.");
        }

        // Verify tenant exists
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            throw new Error("Invalid tenant context provided.");
        }

        user = await prisma.user.create({
            data: {
                email: profile.email.toLowerCase(),
                username: profile.email.split('@')[0].toLowerCase(), // Simple username generation, might need deduplication logic
                name: profile.name || 'SSO User',
                password: await hashPassword(Math.random().toString(36)), // Random password
                role: 'SALES_EXECUTIVE', // Default role for auto-provisioned users
                tenantId: tenant.id,
                ssoProvider: profile.provider,
                ssoProviderId: profile.providerId,
                isActive: true,
                mfaEnabled: false,
            }
        });
    } else {
        // Link account if not linked
        if (!user.ssoProvider) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    ssoProvider: profile.provider,
                    ssoProviderId: profile.providerId,
                }
            });
        }
    }

    if (!user.isActive) {
        throw new Error("Account is inactive");
    }

    // Create session
    const token = await createSession(user.id, user.role, user.tenantId, userAgent, ipAddress);
    return { user, token };
}

export async function linkSSOAccount(userId: string, provider: string, providerId: string) {
    await prisma.user.update({
        where: { id: userId },
        data: {
            ssoProvider: provider,
            ssoProviderId: providerId,
        }
    });
}
