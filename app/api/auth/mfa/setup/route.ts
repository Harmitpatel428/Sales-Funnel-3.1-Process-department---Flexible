import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateTOTPSecret, encryptSecret } from '@/lib/mfa/totp';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { notFoundResponse, errorResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';

export const POST = withApiHandler({ authRequired: true }, async (context: ApiContext) => {
    const session = context.session!;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
    });

    if (!user) return notFoundResponse('User');

    // Generate TOTP secret
    const { secret, qrCodeUrl } = await generateTOTPSecret(user.username || user.email);

    // Encrypt secret
    const encryptedSecret = encryptSecret(secret);

    // Store in DB (default disabled until verified)
    const existing = await prisma.mFASecret.findFirst({
        where: { userId: session.userId, method: 'TOTP' }
    });

    if (existing) {
        await prisma.mFASecret.update({
            where: { id: existing.id },
            data: {
                secret: encryptedSecret,
                isEnabled: false,
                verifiedAt: null,
                backupCodes: '[]', // Reset backup codes
            }
        });
    } else {
        await prisma.mFASecret.create({
            data: {
                userId: session.userId,
                method: 'TOTP',
                secret: encryptedSecret,
                isEnabled: false,
                backupCodes: '[]',
            }
        });
    }

    await addServerAuditLog({
        actionType: 'MFA_SETUP_INITIATED',
        entityType: 'User',
        entityId: user.id,
        description: 'MFA setup initiated (TOTP)',
        performedById: user.id,
        sessionId: session.sessionId,
        ipAddress: context.req.headers.get('x-forwarded-for') || undefined,
        userAgent: context.req.headers.get('user-agent') || undefined
    });

    return NextResponse.json({
        qrCodeUrl,
        secret,
    });
});
