import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendSMSCode } from '@/lib/mfa/sms';
import { sendEmailCode } from '@/lib/mfa/email-code';
import { randomInt } from 'crypto';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { errorResponse, notFoundResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';

export const POST = withApiHandler({ authRequired: true, rateLimit: 5 }, async (context: ApiContext) => {
    const session = context.session!;
    const { method } = await context.req.json(); // 'SMS' or 'EMAIL'

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
    });

    if (!user) return notFoundResponse('User');

    // Generate 6-digit code
    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store code in VerificationCode table
    await prisma.verificationCode.deleteMany({
        where: { userId: session.userId, method }
    });

    await prisma.verificationCode.create({
        data: {
            userId: session.userId,
            code, // In production, hash this!
            method,
            expiresAt,
        }
    });

    let result;
    if (method === 'SMS') {
        // SMS support placeholder as per original
        return errorResponse('SMS not supported yet (missing phone number)', undefined, 400);
    } else if (method === 'EMAIL') {
        result = await sendEmailCode(user.email, code);
    } else {
        return errorResponse('Invalid method', undefined, 400);
    }

    if (!result.success) {
        return errorResponse('Failed to send code');
    }

    await addServerAuditLog({
        actionType: 'MFA_CODE_SENT',
        entityType: 'User',
        entityId: session.userId,
        description: `MFA code sent via ${method}`,
        performedById: session.userId,
        sessionId: session.sessionId,
        ipAddress: context.req.headers.get('x-forwarded-for') || undefined,
        userAgent: context.req.headers.get('user-agent') || undefined
    });

    return NextResponse.json({ success: true, message: 'Code sent' });
});
