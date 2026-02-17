import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { PERMISSIONS } from '@/app/types/permissions';
import { ApiHandler, ApiContext } from '@/lib/api/types';

// GET /api/email/templates - List templates
const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const templates = await prisma.emailTemplate.findMany({
        where: { tenantId: context.session.tenantId, isActive: true },
        orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json({ success: true, templates });
};

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100, permissions: [PERMISSIONS.EMAIL_TEMPLATE_VIEW] },
    getHandler
);

// POST /api/email/templates - Create template
const postHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const body = await req.json();
    const schema = z.object({
        name: z.string(),
        subject: z.string(),
        htmlBody: z.string(),
        category: z.string().optional(),
    });

    const data = schema.parse(body);

    // Extract variables (simple regex for {{var}})
    const variables = Array.from(data.htmlBody.matchAll(/{{(.*?)}}/g)).map(m => m[1]);

    const template = await prisma.emailTemplate.create({
        data: {
            ...data,
            variables: JSON.stringify(variables), // Storing distinct variables
            createdById: context.session.userId,
            tenantId: context.session.tenantId
        }
    });

    return NextResponse.json({ success: true, ...template });
};

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100, permissions: [PERMISSIONS.EMAIL_TEMPLATE_CREATE] },
    postHandler
);


