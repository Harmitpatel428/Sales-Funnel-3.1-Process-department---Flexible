import { NextRequest, NextResponse } from 'next/server';
import { getSession, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { password } = await req.json();

        const user = await prisma.user.findUnique({
            where: { id: session.userId },
        });

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // Verify password
        const validPassword = await verifyPassword(password, user.password);
        if (!validPassword) {
            return NextResponse.json({ error: 'Incorrect password' }, { status: 400 });
        }

        // Disable MFA
        await prisma.$transaction([
            prisma.mFASecret.deleteMany({
                where: { userId: session.userId }
            }),
            prisma.user.update({
                where: { id: session.userId },
                data: { mfaEnabled: false }
            }),
            prisma.session.update({ // Session is no longer MFA verified technically, but user is logged in
                where: { id: session.sessionId },
                data: { mfaVerified: false }
            })
        ]);

        return NextResponse.json({ success: true });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
