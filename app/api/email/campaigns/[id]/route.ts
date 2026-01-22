import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePermissions } from '@/lib/utils/permissions';
import { PERMISSIONS } from '@/app/types/permissions';
import { withApiHandler } from '@/lib/api/withApiHandler';

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const campaign = await prisma.emailCampaign.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId }
        });

        if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        return NextResponse.json(campaign);
    }
);

export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        if (!(await requirePermissions(context.session.userId, [PERMISSIONS.EMAIL_CAMPAIGN_DELETE]))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const campaign = await prisma.emailCampaign.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId }
        });
        if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        await prisma.emailCampaign.delete({ where: { id: context.params.id } });
        return NextResponse.json({ success: true });
    }
);

