import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createSession, isAccountLocked, recordFailedLoginAttempt, resetFailedLoginAttempts } from '@/lib/auth';
import { z } from 'zod';

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, password } = loginSchema.parse(body);

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            // Generic error message for security
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        if (await isAccountLocked(user.id)) {
            return NextResponse.json({ error: 'Account is locked due to too many failed attempts' }, { status: 423 });
        }

        // Handle possible null password (e.g. SSO users)
        if (!user.password) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const isValid = await verifyPassword(password, user.password);

        if (!isValid) {
            await recordFailedLoginAttempt(user.id);
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        await resetFailedLoginAttempts(user.id);

        // Create session
        const token = await createSession(user.id, user.role, user.tenantId);

        return NextResponse.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                tenantId: user.tenantId,
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
        }
        console.error("Login error:", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
