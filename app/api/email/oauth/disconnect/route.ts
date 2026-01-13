import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

export async function DELETE(req: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { providerId, provider } = z.object({
            providerId: z.string().optional(),
            provider: z.string().optional()
        }).parse(body);

        // Delete by ID or by provider name for user
        if (providerId) {
            await prisma.emailProvider.update({
                where: { id: providerId, userId: session.user.id as string },
                data: { isActive: false, accessToken: '', refreshToken: '' }
            });
        } else if (provider) {
            await prisma.emailProvider.updateMany({
                where: { userId: session.user.id as string, provider },
                data: { isActive: false, accessToken: '', refreshToken: '' }
            });
        } else {
            return NextResponse.json({ error: 'Missing providerId or provider' }, { status: 400 });
        }

        // Audit log (simplified)
        await prisma.auditLog.create({
            data: {
                actionType: 'EMAIL_PROVIDER_DISCONNECT',
                description: `Disconnected email provider ${provider || providerId}`,
                performedById: session.user.id as string,
                tenantId: (await prisma.user.findUnique({ where: { id: session.user.id as string } }))!.tenantId
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
