import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyTOTP, decryptSecret, encryptSecret } from '@/lib/mfa/totp';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { errorResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';

export const POST = withApiHandler({ authRequired: true }, async (context: ApiContext) => {
    const session = context.session!;
    const { code, method = 'TOTP' } = await context.req.json();

    const mfaRecord = await prisma.mFASecret.findFirst({
        where: { userId: session.userId, method: 'TOTP', isEnabled: true }
    });

    if (!mfaRecord) {
        return errorResponse('MFA not enabled', undefined, 400);
    }

    let isValid = false;

    if (method === 'BACKUP_CODE') {
        // Check backup codes
        const backupCodesDecrypted = JSON.parse(decryptSecret(mfaRecord.backupCodes || '[]'));
        const index = backupCodesDecrypted.indexOf(code);
        if (index > -1) {
            isValid = true;
            // Remove used code
            backupCodesDecrypted.splice(index, 1);
            // Update DB
            await prisma.mFASecret.update({
                where: { id: mfaRecord.id },
                data: {
                    backupCodes: encryptSecret(JSON.stringify(backupCodesDecrypted))
                }
            });
        }
    } else {
        // TOTP
        const secret = decryptSecret(mfaRecord.secret);
        isValid = verifyTOTP(code, secret);
    }

    if (isValid) {
        // Mark session as verified
        await prisma.session.update({
            where: { id: session.sessionId },
            data: { mfaVerified: true }
        });

        await addServerAuditLog({
            actionType: 'MFA_VERIFIED',
            entityType: 'User',
            entityId: session.userId,
            description: `MFA verified via ${method}`,
            performedById: session.userId,
            sessionId: session.sessionId,
            ipAddress: context.req.headers.get('x-forwarded-for') || undefined,
            userAgent: context.req.headers.get('user-agent') || undefined
        });

        return NextResponse.json({ success: true });
    } else {
        await addServerAuditLog({
            actionType: 'MFA_FAILED',
            entityType: 'User',
            entityId: session.userId,
            description: `MFA verification failed via ${method}`,
            performedById: session.userId,
            sessionId: session.sessionId,
            ipAddress: context.req.headers.get('x-forwarded-for') || undefined,
            userAgent: context.req.headers.get('user-agent') || undefined
        });

        return errorResponse('Invalid code', undefined, 400);
    }
});
