import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePermissions } from '@/lib/utils/permissions';
import { PERMISSIONS } from '@/app/types/permissions';
import { emailSyncQueue } from '@/lib/jobs/email-sync';
import { withApiHandler } from '@/lib/api/withApiHandler';

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 20 },
    async (req: NextRequest, context) => {
        if (!(await requirePermissions(context.session.userId, [PERMISSIONS.EMAIL_VIEW_OWN]))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const user = await prisma.user.findUnique({
            where: { id: context.session.userId },
            include: { emailProviders: { where: { isActive: true } } }
        });

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const results: Array<{ providerId: string; status: string }> = [];
        const errors: Array<{ providerId: string; error: string }> = [];

        for (const provider of user.emailProviders) {
            try {
                await emailSyncQueue.add('sync-provider', { providerId: provider.id }, {
                    jobId: `manual-sync-${provider.id}-${Date.now()}`,
                    removeOnComplete: true
                });
                results.push({ providerId: provider.id, status: 'Queued' });
            } catch (error: any) {
                console.error(`Queue failed for provider ${provider.id}:`, error);
                errors.push({ providerId: provider.id, error: error.message });
            }
        }

        return NextResponse.json({
            message: 'Sync completed',
            results,
            errors,
            timestamp: new Date()
        });
    }
);

