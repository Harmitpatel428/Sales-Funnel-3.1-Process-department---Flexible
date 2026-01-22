import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withApiHandler } from '@/lib/api/withApiHandler';

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const campaigns = await prisma.emailCampaign.findMany({
            where: { tenantId: context.session.tenantId },
            orderBy: { createdAt: 'desc' },
            include: { createdBy: { select: { name: true } } }
        });

        return NextResponse.json(campaigns);
    }
);

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const body = await req.json();
        // Simplified validation
        const schema = z.object({
            name: z.string(),
            subject: z.string(),
            htmlBody: z.string(),
            targetLeadIds: z.array(z.string()), // Expecting array, schema stores JSON string
            status: z.enum(['DRAFT', 'SCHEDULED']).default('DRAFT')
        });

        const data = schema.parse(body);

        const campaign = await prisma.emailCampaign.create({
            data: {
                name: data.name,
                subject: data.subject,
                htmlBody: data.htmlBody,
                targetLeadIds: JSON.stringify(data.targetLeadIds),
                totalRecipients: data.targetLeadIds.length,
                status: data.status,
                createdById: context.session.userId,
                tenantId: context.session.tenantId
            }
        });

        return NextResponse.json(campaign);
    }
);

