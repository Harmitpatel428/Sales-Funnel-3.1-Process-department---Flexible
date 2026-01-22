import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword, checkPasswordHistory, validatePasswordStrength } from '@/lib/auth';
import { z } from 'zod';
import crypto from 'crypto';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { validationErrorResponse, unauthorizedResponse, notFoundResponse, errorResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';

const passwordUpdateSchema = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(1),
});

export const PUT = withApiHandler({ authRequired: true }, async (context: ApiContext) => {
    // Session is guaranteed by wrapper
    const session = context.session!;

    const body = await context.req.json();
    if (!validationResult.success) {
        return NextResponse.json({ error: 'Validation error', details: validationResult.error.errors }, { status: 400 });
    }

    const { oldPassword, newPassword } = validationResult.data;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
    });

    if (!user || !user.password) {
        return notFoundResponse('User');
    }

    // Verify old password
    const isValid = await verifyPassword(oldPassword, user.password);
    if (!isValid) {
        return NextResponse.json({ error: 'Invalid old password' }, { status: 400 });
    }

    // Check strength
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
        return NextResponse.json({ error: strength.message }, { status: 400 });
    }

    // History check
    const usedRecently = await checkPasswordHistory(user.id, newPassword);
    if (usedRecently) {
        return NextResponse.json({ error: 'Password has been used recently' }, { status: 400 });
    }

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Update user
    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: newHash,
            passwordExpiresAt: null, // Reset expiry? Or set to now + 90 days?
            // Store old password in history (create separate record)
        }
    });

    // Explicitly add to history (prisma logic usually here or in a transaction)
    await prisma.password_history.create({
        data: {
            id: crypto.randomUUID(),
            userId: user.id,
            passwordHash: user.password, // Store the OLD hash
        }
    });

    await addServerAuditLog({
        actionType: 'PASSWORD_CHANGE',
        entityType: 'User',
        entityId: user.id,
        description: 'User changed password',
        ipAddress: context.req.headers.get('x-forwarded-for') || undefined,
        userAgent: context.req.headers.get('user-agent') || undefined,
        performedById: user.id,
        sessionId: session.sessionId
    });

    return NextResponse.json({ success: true });
});
