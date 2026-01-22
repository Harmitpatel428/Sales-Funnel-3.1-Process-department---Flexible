import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createSession, isAccountLocked, recordFailedLoginAttempt, resetFailedLoginAttempts } from '@/lib/auth';
import { calculateSessionExpiry, getSessionCookieOptions } from '@/lib/authCookies';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { z } from 'zod';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { validationErrorResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    rememberMe: z.boolean().optional()
});

export const POST = withApiHandler({ authRequired: false, rateLimit: 10 }, async (context: ApiContext) => {
    const body = await context.req.json();
    const validationResult = loginSchema.safeParse(body);

    if (!validationResult.success) {
        return NextResponse.json({ success: false, message: 'Validation error', details: validationResult.error.errors }, { status: 400 });
    }

    const { username, password, rememberMe } = validationResult.data;

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { username: username.toLowerCase() },
                { email: username.toLowerCase() }
            ]
        },
        include: {
            customRole: {
                select: { id: true, name: true }
            }
        }
    });

    const ipAddress = context.req.headers.get('x-forwarded-for') || undefined;
    const userAgent = context.req.headers.get('user-agent') || undefined;

    if (!user) {
        // Log failed attempt (user not found)
        await addServerAuditLog({
            actionType: 'LOGIN_FAILED',
            description: `Login failed for username: ${username} (User not found)`,
            ipAddress,
            userAgent,
            metadata: { username }
        });
        return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    if (!user.isActive) {
        await addServerAuditLog({
            actionType: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: user.id,
            description: 'Login failed: Account deactivated',
            ipAddress,
            userAgent,
            performedById: user.id
        });
        return NextResponse.json({ success: false, message: 'Your account has been deactivated' }, { status: 403 });
    }

    if (await isAccountLocked(user.id)) {
        await addServerAuditLog({
            actionType: 'LOGIN_LOCKED',
            entityType: 'User',
            entityId: user.id,
            description: 'Login attempt on locked account',
            ipAddress,
            userAgent,
            performedById: user.id
        });
        return NextResponse.json({ success: false, message: 'Account is locked due to too many failed attempts' }, { status: 423 });
    }

    // Handle possible null password (e.g. SSO users)
    if (!user.password) {
        await addServerAuditLog({
            actionType: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: user.id,
            description: 'Login failed: No password set (SSO account?)',
            ipAddress,
            userAgent,
            performedById: user.id
        });
        return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.password);

    if (!isValid) {
        await recordFailedLoginAttempt(user.id);
        await addServerAuditLog({
            actionType: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: user.id,
            description: 'Login failed: Invalid password',
            ipAddress,
            userAgent,
            performedById: user.id
        });
        return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    await resetFailedLoginAttempts(user.id);

    if (user.mfaEnabled) {
        await addServerAuditLog({
            actionType: 'LOGIN_MFA_REQUIRED',
            entityType: 'User',
            entityId: user.id,
            description: 'MFA challenge required',
            ipAddress,
            userAgent,
            performedById: user.id
        });
        return NextResponse.json({
            success: true,
            mfaRequired: true,
            userId: user.id,
            message: 'MFA verification required'
        }, { status: 200 });
    }

    const token = await createSession(
        user.id,
        user.role,
        user.tenantId,
        userAgent,
        ipAddress,
        rememberMe
    );
    const permissions = await getUserPermissions(user.id);

    await addServerAuditLog({
        actionType: 'LOGIN_SUCCESS',
        entityType: 'User',
        entityId: user.id,
        description: 'Login successful',
        ipAddress,
        userAgent,
        performedById: user.id,
        performedByName: user.username,
        sessionId: token
    });

    const response = NextResponse.json({
        success: true,
        message: 'Login successful',
        user: {
            userId: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            permissions: Array.from(permissions),
            roleId: user.roleId,
            customRole: user.customRole,
            mfaEnabled: user.mfaEnabled,
            ssoProvider: user.ssoProvider,
            lastLoginAt: new Date().toISOString()
        }
    });

    const expiresAt = calculateSessionExpiry(rememberMe);
    const cookieOptions = getSessionCookieOptions(expiresAt);

    response.cookies.set('session_token', token, cookieOptions);

    return response;
});
