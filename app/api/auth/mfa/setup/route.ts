import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db'; // Ensure consistent import
import { generateTOTPSecret, encryptSecret } from '@/lib/mfa/totp';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // Generate TOTP secret
        const { secret, qrCodeUrl } = await generateTOTPSecret(user.username || user.email);

        // Encrypt secret
        const encryptedSecret = encryptSecret(secret);

        // Store in DB (default disabled until verified)
        // Check if existing secret exists, update it or create new
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

        return NextResponse.json({
            qrCodeUrl,
            secret, // Usually we don't return secret if QR is enough, but plan says "Return QR code data URL and manual entry code"
        });

    } catch (error: any) {
        console.error("MFA Setup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
