import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantId = (await prisma.user.findUnique({ where: { id: session.user.id as string } }))?.tenantId;
    const templates = await prisma.emailTemplate.findMany({
        where: { tenantId, isActive: true },
        orderBy: { updatedAt: 'desc' }
    });

    return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const schema = z.object({
        name: z.string(),
        subject: z.string(),
        htmlBody: z.string(),
        category: z.string().optional(),
    });

    try {
        const data = schema.parse(body);
        const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });

        // Extract variables (simple regex for {{var}})
        const variables = Array.from(data.htmlBody.matchAll(/{{(.*?)}}/g)).map(m => m[1]);

        const template = await prisma.emailTemplate.create({
            data: {
                ...data,
                variables: JSON.stringify(variables), // Storing distinct variables
                createdById: session.user.id as string,
                tenantId: user!.tenantId
            }
        });

        return NextResponse.json(template);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
