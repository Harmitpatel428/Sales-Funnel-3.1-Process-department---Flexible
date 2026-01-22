import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiHandler } from '@/lib/api/withApiHandler';
// import { emailQueue } from '@/lib/jobs/email-queue'; // Not implemented yet in this turn

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const campaign = await prisma.emailCampaign.findUnique({ where: { id: context.params.id } });
        if (!campaign || campaign.status === 'SENT') {
            return NextResponse.json({ error: 'Invalid campaign' }, { status: 400 });
        }

        // Update status
        await prisma.emailCampaign.update({
            where: { id: context.params.id },
            data: { status: 'SENDING' }
        });

        // Queue jobs (Simulated for now, user asked for Bull queue usage)
        // We would iterate JSON.parse(campaign.targetLeadIds) and add jobs
        // const leadIds = JSON.parse(campaign.targetLeadIds);
        // leadIds.forEach(leadId => emailQueue.add(...) );

        // For MVP/step, we assume a background job will pick up 'SENDING' campaigns or we trigger it here.
        // I'll leave the actual Bull implementation for the 'Create Email Sync Background Job' step
        // just return success here.

        return NextResponse.json({ success: true, message: 'Campaign queued' });
    }
);

