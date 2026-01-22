import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withApiHandler } from '@/lib/api/withApiHandler';

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const templates = await prisma.emailTemplate.findMany({
            where: { tenantId: context.session.tenantId, isActive: true },
            orderBy: { updatedAt: 'desc' }
        });

        return NextResponse.json(templates);
    }
);

export const POST = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
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

        return NextResponse.json(template);
    }
);

