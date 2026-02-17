import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, validatePasswordStrength, checkPasswordHistory } from '@/lib/auth';
import { sendEmail } from '@/lib/email'; // For confirmation email if needed
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { validationErrorResponse, errorResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';

// skipTenantCheck: true - Public endpoint, no tenant context available
export const POST = withApiHandler({ authRequired: false, rateLimit: 5, skipTenantCheck: true }, async (context: ApiContext) => {
    const body = await context.req.json();
    const { token, password } = body;

    if (!token || !password) {
        return NextResponse.json({ success: false, message: 'Token and password are required' }, { status: 400 });
    }

    // Verify token
    const resetRecord = await prisma.passwordResetToken.findUnique({
        where: { token },
        include: { user: true },
    });

    const ipAddress = context.req.headers.get('x-forwarded-for') || undefined;
    const userAgent = context.req.headers.get('user-agent') || undefined;

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
        await addServerAuditLog({
            actionType: 'PASSWORD_RESET_FAILED',
            description: 'Password reset failed: Invalid or expired token',
            ipAddress,
            userAgent,
            metadata: { token: 'REDACTED' } // Don't log expected token for security
        });
        return NextResponse.json({ success: false, message: 'Invalid or expired token' }, { status: 400 });
    }

    // Validate password strength
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
        return NextResponse.json({ success: false, message: strength.message }, { status: 400 });
    }

    // Check history
    const historyCheck = await checkPasswordHistory(resetRecord.userId, password);
    if (historyCheck) {
        return NextResponse.json({ success: false, message: 'Password has been used recently. Please choose a different password.' }, { status: 400 });
    }

    // Update password
    const hashedPassword = await hashPassword(password);

    await prisma.user.update({
        where: { id: resetRecord.userId },
        data: {
            password: hashedPassword,
            passwordLastChangedAt: new Date(),
            mustChangePassword: false,
            failedLoginAttempts: 0,
            lockedUntil: null,
            passwordHistory: {
                create: {
                    passwordHash: hashedPassword,
                }
            }
        }
    });

    // Delete used token
    await prisma.passwordResetToken.delete({
        where: { id: resetRecord.id }
    });

    await addServerAuditLog({
        actionType: 'PASSWORD_RESET_SUCCESS',
        entityType: 'User',
        entityId: resetRecord.userId,
        description: 'Password reset successfully completed',
        ipAddress,
        userAgent,
        performedById: resetRecord.userId,
        performedByName: resetRecord.user.email
    });

    return NextResponse.json({ success: true, message: 'Password has been reset successfully.' });
});
