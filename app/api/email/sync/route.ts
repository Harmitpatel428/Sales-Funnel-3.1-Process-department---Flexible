import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth'; // or 'next-auth/next' depending on version
import { PrismaClient } from '@prisma/client';
import { EmailService } from '@/lib/email-service';
import { requirePermissions } from '@/lib/utils/permissions';
import { PERMISSIONS } from '@/app/types/permissions';
import { emailSyncQueue } from '@/lib/jobs/email-sync';

const prisma = new PrismaClient();
const emailService = new EmailService();

export async function POST(req: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requirePermissions(session.user.id as string, [PERMISSIONS.EMAIL_VIEW_OWN]))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id as string },
            include: { emailProviders: { where: { isActive: true } } }
        });

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const results = [];
        const errors = [];


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

    } catch (error: any) {
        console.error('Sync route error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
