import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './db';

// ============================================================================
// CONSTANTS
// ============================================================================

const BCRYPT_SALT_ROUNDS = 12;
const SESSION_COOKIE_NAME = 'session_token';
const SESSION_EXPIRY_DAYS = 7;
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const PASSWORD_MIN_LENGTH = parseInt(process.env.PASSWORD_MIN_LENGTH || '12');
const PASSWORD_EXPIRY_DAYS = parseInt(process.env.PASSWORD_EXPIRY_DAYS || '90');
const PASSWORD_HISTORY_COUNT = parseInt(process.env.PASSWORD_HISTORY_COUNT || '5');
const REMEMBER_ME_EXPIRY_DAYS = parseInt(process.env.REMEMBER_ME_EXPIRY_DAYS || '30');

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
 * Create a new session in the database and set the cookie.
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

    // Set HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
    });

    return token;
}

/**
 * Get the current session from the cookie and validate it.
 */
export async function getSession(): Promise<{
    userId: string;
    role: string;
    sessionId: string;
    tenantId: string;
} | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

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
 * Invalidate the current session (logout).
 */
export async function invalidateSession(): Promise<void> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
        // Mark session as invalid in database
        await prisma.session.updateMany({
            where: { token },
            data: { isValid: false },
        });

        // Remove cookie
        cookieStore.delete(SESSION_COOKIE_NAME);
    }
}

/**
 * Rotate session token (for security after privilege changes).
 */
export async function rotateSessionToken(userId: string): Promise<void> {
    const cookieStore = await cookies();
    const oldToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (oldToken) {
        // Get user to get role and tenantId
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
            // Invalidate old session
            await prisma.session.updateMany({
                where: { token: oldToken },
                data: { isValid: false },
            });

            // Create new session with tenantId
            await createSession(userId, user.role, user.tenantId);
        }
    }
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
