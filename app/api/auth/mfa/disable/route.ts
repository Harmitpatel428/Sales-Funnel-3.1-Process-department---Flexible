import { NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { validationErrorResponse, notFoundResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';

export const POST = withApiHandler({ authRequired: true }, async (context: ApiContext) => {
    const session = context.session!;
    const { password } = await context.req.json();

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
    });

    if (!user) return notFoundResponse('User');

    // Verify password
    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
        return validationErrorResponse(['Incorrect password']);
    }

    // Disable MFA
    await prisma.$transaction([
        prisma.mFASecret.deleteMany({
            where: { userId: session.userId }
        }),
        prisma.user.update({
            where: { id: session.userId },
            data: { mfaEnabled: false }
        }),
        prisma.session.update({
            where: { id: session.sessionId },
            data: { mfaVerified: false }
        })
    ]);

    await addServerAuditLog({
        actionType: 'MFA_DISABLED',
        entityType: 'User',
        entityId: session.userId,
        description: 'MFA disabled',
        performedById: session.userId,
        sessionId: session.sessionId,
        ipAddress: context.req.headers.get('x-forwarded-for') || undefined,
        userAgent: context.req.headers.get('user-agent') || undefined
    });

    return NextResponse.json({ success: true });
});
