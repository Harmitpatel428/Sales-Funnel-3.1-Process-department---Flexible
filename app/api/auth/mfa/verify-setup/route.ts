import { NextRequest, NextResponse } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { prisma } from '@/lib/db';
import { verifyTOTP, decryptSecret, generateBackupCodes, encryptSecret } from '@/lib/mfa/totp';

export async function POST(req: NextRequest) {
    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { code } = await req.json();

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

        return NextResponse.json({ success: true, backupCodes });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
