
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, validatePasswordStrength, checkPasswordHistory } from '@/lib/auth';
import { sendEmail } from '@/lib/email'; // For confirmation email if needed

export async function POST(req: NextRequest) {
    try {
        const { token, password } = await req.json();

        if (!token || !password) {
            return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
        }

        // Verify token
        const resetRecord = await prisma.passwordResetToken.findUnique({
            where: { token },
            include: { user: true },
        });

        if (!resetRecord || resetRecord.expiresAt < new Date()) {
            return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 });
        }

        // Validate password strength
        const strength = validatePasswordStrength(password);
        if (!strength.valid) {
            return NextResponse.json({ error: strength.message }, { status: 400 });
        }

        // Check history
        const historyCheck = await checkPasswordHistory(resetRecord.userId, password);
        if (historyCheck) {
            return NextResponse.json({ error: 'Password has been used recently. Please choose a different password.' }, { status: 400 });
        }

        // Update password
        const hashedPassword = await hashPassword(password);

        await prisma.user.update({
            where: { id: resetRecord.userId },
            data: {
                password: hashedPassword,
                passwordLastChangedAt: new Date(),
                mustChangePassword: false,
                failedLoginAttempts: 0,
                lockedUntil: null,
                passwordHistory: {
                    create: {
                        passwordHash: hashedPassword,
                    }
                }
            }
        });

        // Delete used token
        await prisma.passwordResetToken.delete({
            where: { id: resetRecord.id }
        });

        return NextResponse.json({ success: true, message: 'Password has been reset successfully.' });

    } catch (error: any) {
        console.error('Reset password error:', error);
        return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
    }
}
