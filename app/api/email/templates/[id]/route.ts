import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';
import { EmailTemplateSchema } from '@/lib/validation/email-schemas';
import { PERMISSIONS } from '@/app/types/permissions';
import { requirePermissions } from '@/lib/utils/permissions';

const prisma = new PrismaClient();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const template = await prisma.emailTemplate.findFirst({
        where: { id, tenantId: user.tenantId }
    });

    if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(template);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Check existing
    const existing = await prisma.emailTemplate.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    try {
        const body = await req.json();
        const data = EmailTemplateSchema.partial().parse(body);

        await prisma.emailTemplate.update({
            where: { id },
            data: { ...data, updatedAt: new Date() }
        });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await requirePermissions(session.user.id as string, [PERMISSIONS.EMAIL_TEMPLATE_DELETE]))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const existing = await prisma.emailTemplate.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.emailTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
