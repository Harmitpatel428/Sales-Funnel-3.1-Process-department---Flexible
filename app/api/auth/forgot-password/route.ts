
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { passwordResetTemplate } from '@/lib/email-templates';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            // Return success even if user not found to prevent enumeration
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

        return NextResponse.json({ success: true, message: 'If an account exists, a reset link has been sent.' });

    } catch (error: any) {
        console.error('Forgot password error:', error);
        return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
    }
}
