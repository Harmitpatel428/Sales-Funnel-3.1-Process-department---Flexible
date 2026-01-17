import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createSession, isAccountLocked, recordFailedLoginAttempt, resetFailedLoginAttempts } from '@/lib/auth';
import { calculateSessionExpiry, getSessionCookieOptions } from '@/lib/authCookies';
import { getUserPermissions } from '@/lib/middleware/permissions';
import { z } from 'zod';

const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    rememberMe: z.boolean().optional()
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { username, password, rememberMe } = loginSchema.parse(body);

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

        if (!user) {
            return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
        }

        if (!user.isActive) {
            return NextResponse.json({ success: false, message: 'Your account has been deactivated' }, { status: 403 });
        }

        if (await isAccountLocked(user.id)) {
            return NextResponse.json({ success: false, message: 'Account is locked due to too many failed attempts' }, { status: 423 });
        }

        // Handle possible null password (e.g. SSO users)
        if (!user.password) {
            return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
        }

        const isValid = await verifyPassword(password, user.password);

        if (!isValid) {
            await recordFailedLoginAttempt(user.id);
            return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
        }

        await resetFailedLoginAttempts(user.id);

        if (user.mfaEnabled) {
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
            req.headers.get('user-agent') || undefined,
            req.headers.get('x-forwarded-for') || undefined,
            rememberMe
        );
        const permissions = await getUserPermissions(user.id);

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

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error("Login error:", error);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}
