import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { EmailTemplateSchema } from '@/lib/validation/email-schemas';
import { PERMISSIONS } from '@/app/types/permissions';
import { requirePermissions } from '@/lib/utils/permissions';
import { withApiHandler } from '@/lib/api/withApiHandler';

export const GET = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        const template = await prisma.emailTemplate.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId }
        });

        if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        return NextResponse.json(template);
    }
);

export const PUT = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        // Check existing
        const existing = await prisma.emailTemplate.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId }
        });
        if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        const body = await req.json();
        const data = EmailTemplateSchema.partial().parse(body);

        await prisma.emailTemplate.update({
            where: { id: context.params.id },
            data: { ...data, updatedAt: new Date() }
        });
        return NextResponse.json({ success: true });
    }
);

export const DELETE = withApiHandler(
    { authRequired: true, checkDbHealth: true, rateLimit: 100 },
    async (req: NextRequest, context) => {
        if (!(await requirePermissions(context.session.userId, [PERMISSIONS.EMAIL_TEMPLATE_DELETE]))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const existing = await prisma.emailTemplate.findFirst({
            where: { id: context.params.id, tenantId: context.session.tenantId }
        });
        if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        await prisma.emailTemplate.delete({ where: { id: context.params.id } });
        return NextResponse.json({ success: true });
    }
);

