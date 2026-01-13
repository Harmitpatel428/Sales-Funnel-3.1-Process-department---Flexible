import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword, getSession, checkPasswordHistory, validatePasswordStrength } from '@/lib/auth';
import { z } from 'zod';
import crypto from 'crypto';

const passwordUpdateSchema = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(1),
});

export async function PUT(req: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { oldPassword, newPassword } = passwordUpdateSchema.parse(body);

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (!user || !user.password) {
            return NextResponse.json({ error: 'User not found or invalid state' }, { status: 404 });
        }

        // Verify old password
        const isValid = await verifyPassword(oldPassword, user.password);
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid old password' }, { status: 400 });
        }

        // Check strength
        const strength = validatePasswordStrength(newPassword);
        if (!strength.valid) {
            return NextResponse.json({ error: strength.message }, { status: 400 });
        }

        // History check
        const usedRecently = await checkPasswordHistory(user.id, newPassword);
        if (usedRecently) {
            return NextResponse.json({ error: 'Password has been used recently' }, { status: 400 });
        }

        // Hash new password
        const newHash = await hashPassword(newPassword);

        // Update user
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: newHash,
                passwordExpiresAt: null, // Reset expiry? Or set to now + 90 days?
                // Store old password in history (create separate record)
            }
        });

        // Explicitly add to history (prisma logic usually here or in a transaction)
        await prisma.password_history.create({
            data: {
                id: crypto.randomUUID(),
                userId: user.id,
                passwordHash: user.password, // Store the OLD hash
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error("Password update error:", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
