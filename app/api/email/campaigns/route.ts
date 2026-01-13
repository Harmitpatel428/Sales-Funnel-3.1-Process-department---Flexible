import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantId = (await prisma.user.findUnique({ where: { id: session.user.id as string } }))?.tenantId;
    const campaigns = await prisma.emailCampaign.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { name: true } } }
    });

    return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    // Simplified validation
    const schema = z.object({
        name: z.string(),
        subject: z.string(),
        htmlBody: z.string(),
        targetLeadIds: z.array(z.string()), // Expecting array, schema stores JSON string
        status: z.enum(['DRAFT', 'SCHEDULED']).default('DRAFT')
    });

    try {
        const data = schema.parse(body);
        const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });

        const campaign = await prisma.emailCampaign.create({
            data: {
                name: data.name,
                subject: data.subject,
                htmlBody: data.htmlBody,
                targetLeadIds: JSON.stringify(data.targetLeadIds),
                totalRecipients: data.targetLeadIds.length,
                status: data.status,
                createdById: session.user.id as string,
                tenantId: user!.tenantId
            }
        });

        return NextResponse.json(campaign);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
