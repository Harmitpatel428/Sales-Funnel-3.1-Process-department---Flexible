import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiHandler } from '@/lib/api/withApiHandler';

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const email = await prisma.email.findUnique({
            where: { id: context.params.id },
            include: { attachments: true }
        });

        if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

        // Tenant check
        if (email.tenantId !== context.session.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        return NextResponse.json(email);
    }
);

export const PUT = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const emailCheck = await prisma.email.findUnique({
            where: { id: context.params.id },
            select: { tenantId: true }
        });

        if (!emailCheck) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

        if (emailCheck.tenantId !== context.session.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        const { status, isRead } = body;

        // Basic update
        const email = await prisma.email.update({
            where: { id: context.params.id },
            data: {
                status: status || undefined,
                // If "read" action, we might update openedAt if it's null?
                openedAt: isRead ? new Date() : undefined
            }
        });

        return NextResponse.json(email);
    }
);

export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const emailCheck = await prisma.email.findUnique({
            where: { id: context.params.id },
            select: { tenantId: true }
        });

        if (!emailCheck) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

        if (emailCheck.tenantId !== context.session.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await prisma.email.delete({ where: { id: context.params.id } });
        return NextResponse.json({ success: true });
    }
);

