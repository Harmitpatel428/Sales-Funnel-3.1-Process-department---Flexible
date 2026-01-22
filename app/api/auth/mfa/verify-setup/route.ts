import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyTOTP, decryptSecret, generateBackupCodes, encryptSecret } from '@/lib/mfa/totp';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiContext } from '@/lib/api/types';
import { validationErrorResponse, errorResponse } from '@/lib/api/response-helpers';
import { addServerAuditLog } from '@/app/actions/audit';
import { z } from 'zod';

// Schema for validation
const verifySetupSchema = z.object({
    code: z.string().min(6)
});

export const POST = withApiHandler({ authRequired: true }, async (context: ApiContext) => {
    const session = context.session!;
    const body = await context.req.json();

    const validationResult = verifySetupSchema.safeParse(body);
    if (!validationResult.success) {
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    const { code } = validationResult.data;

    const mfaRecord = await prisma.mFASecret.findFirst({
        where: { userId: session.userId, method: 'TOTP' }
    });

    if (!mfaRecord) {
        return NextResponse.json({ error: 'MFA setup not initiated' }, { status: 400 });
    }

    // Decrypt secret
    const secret = decryptSecret(mfaRecord.secret);

    // Verify code
    const isValid = verifyTOTP(code, secret);

    if (!isValid) {
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Generate Backup Codes
    const backupCodes = generateBackupCodes();
    // Encrypt backup codes (store as JSON string encrypted)
    const encryptedBackupCodes = encryptSecret(JSON.stringify(backupCodes));

    // Enable MFA
    await prisma.$transaction([
        prisma.mFASecret.update({
            where: { id: mfaRecord.id },
            data: {
                isEnabled: true,
                verifiedAt: new Date(),
                backupCodes: encryptedBackupCodes,
            }
        }),
        prisma.user.update({
            where: { id: session.userId },
            data: { mfaEnabled: true }
        })
    ]);

    await addServerAuditLog({
        actionType: 'MFA_ENABLED',
        entityType: 'User',
        entityId: session.userId,
        description: 'MFA enabled successfully',
        performedById: session.userId,
        sessionId: session.sessionId,
        ipAddress: context.req.headers.get('x-forwarded-for') || undefined,
        userAgent: context.req.headers.get('user-agent') || undefined
    });

    return NextResponse.json({ success: true, backupCodes });
});
