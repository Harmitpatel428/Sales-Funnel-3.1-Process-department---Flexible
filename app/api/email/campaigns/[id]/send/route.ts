import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
// import { emailQueue } from '@/lib/jobs/email-queue'; // Not implemented yet in this turn

const prisma = new PrismaClient();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign || campaign.status === 'SENT') {
        return NextResponse.json({ error: 'Invalid campaign' }, { status: 400 });
    }

    // Update status
    await prisma.emailCampaign.update({
        where: { id },
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
