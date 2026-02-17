import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';
import { ApiHandler, ApiContext } from '@/lib/api/types';

// GET /api/email/campaigns - List campaigns
const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const campaigns = await prisma.emailCampaign.findMany({
        where: { tenantId: context.session.tenantId },
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { name: true } } }
    });

    return NextResponse.json({ success: true, campaigns });
};

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100, permissions: [PERMISSIONS.EMAIL_CAMPAIGN_VIEW] },
    getHandler
);

// POST /api/email/campaigns - Create campaign
const postHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
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

    return NextResponse.json({ success: true, ...campaign });
};

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100, permissions: [PERMISSIONS.EMAIL_CAMPAIGN_CREATE] },
    postHandler
);


