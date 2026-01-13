import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
import { requirePermissions } from '@/lib/utils/permissions';
import { PERMISSIONS } from '@/app/types/permissions';

const prisma = new PrismaClient();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const campaign = await prisma.emailCampaign.findFirst({
        where: { id, tenantId: user.tenantId }
    });

    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(campaign);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requirePermissions(session.user.id as string, [PERMISSIONS.EMAIL_CAMPAIGN_DELETE]))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const campaign = await prisma.emailCampaign.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.emailCampaign.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
