import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { passwordResetTemplate } from '@/lib/email-templates';
import { randomBytes } from 'crypto';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { errorResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';

export const POST = withApiHandler({ authRequired: false, rateLimit: 5 }, async (context: ApiContext) => {
    const body = await context.req.json();
    const { email } = body;

    if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
    });

    const ipAddress = context.req.headers.get('x-forwarded-for') || undefined;
    const userAgent = context.req.headers.get('user-agent') || undefined;

    if (!user) {
        // Return success even if user not found to prevent enumeration
        // Log this? Maybe helpful for security monitoring
        await addServerAuditLog({
            actionType: 'FORGOT_PASSWORD_REQUEST',
            description: `Password reset requested for non-existent email: ${email}`,
            ipAddress,
            userAgent,
            metadata: { email }
        });
        return NextResponse.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    }

    // Generate token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    // Delete existing valid tokens for this user
    await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id }
    });

    // Store token
    await prisma.passwordResetToken.create({
        data: {
            userId: user.id,
            token,
            expiresAt,
        }
    });

    // Send email
    const resetLink = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
    const html = passwordResetTemplate(resetLink); // Ensure template accepts arguments

    await sendEmail({
        to: user.email,
        subject: 'Reset your password',
        html,
    });

    await addServerAuditLog({
        actionType: 'FORGOT_PASSWORD_REQUEST',
        entityType: 'User',
        entityId: user.id,
        description: 'Password reset link sent',
        ipAddress,
        userAgent,
        performedById: user.id,
        performedByName: user.email
    });

    return NextResponse.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
});
