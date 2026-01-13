import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { verifyTOTP, decryptSecret, encryptSecret } from '@/lib/mfa/totp';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        // Allow if session exists (even if partial/mfaVerified=false)
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { code, method = 'TOTP' } = await req.json(); // method could be BACKUP_CODE

        const mfaRecord = await prisma.mFASecret.findFirst({
            where: { userId: session.userId, method: 'TOTP', isEnabled: true }
        });

        if (!mfaRecord) {
            // Should not happen if user has mfaEnabled=true
            return NextResponse.json({ error: 'MFA not enabled' }, { status: 400 });
        }

        let isValid = false;
        let backupCodesUpdated = false;

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
                backupCodesUpdated = true;
            }
        } else {
            // TOTP
            const secret = decryptSecret(mfaRecord.secret);
            isValid = verifyTOTP(code, secret);
        }

        if (isValid) {
            // Mark session as verified
            await prisma.session.update({
                where: { id: session.sessionId }, // session.sessionId from getSession mapping
                data: { mfaVerified: true }
            });

            // Log event (TODO: Audit Log)

            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
        }

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
