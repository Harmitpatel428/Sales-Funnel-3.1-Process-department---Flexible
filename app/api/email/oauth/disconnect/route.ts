import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withApiHandler } from '@/lib/api/withApiHandler';

export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const body = await req.json();
        const { providerId, provider } = z.object({
            providerId: z.string().optional(),
            provider: z.string().optional()
        }).parse(body);

        // Delete by ID or by provider name for user
        if (providerId) {
            await prisma.emailProvider.update({
                where: { id: providerId, userId: context.session.userId },
                data: { isActive: false, accessToken: '', refreshToken: '' }
            });
        } else if (provider) {
            await prisma.emailProvider.updateMany({
                where: { userId: context.session.userId, provider },
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
                performedById: context.session.userId,
                tenantId: context.session.tenantId
            }
        });

        return NextResponse.json({ success: true });
    }
);

