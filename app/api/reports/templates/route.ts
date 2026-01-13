import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from '@/lib/auth';
import { ReportTemplateSchema, UpdateReportTemplateSchema } from '@/lib/validation/report-schemas';
import { z } from 'zod';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const category = searchParams.get('category');

        const templates = await prisma.reportTemplate.findMany({
            where: {
                tenantId: session.user.tenantId,
                OR: [
                    { createdById: session.user.id },
                    { isPublic: true }
                ],
                ...(category ? { category } : {})
            },
            include: { createdBy: { select: { id: true, name: true } } },
            orderBy: { updatedAt: 'desc' }
        });

        return NextResponse.json({ success: true, data: { templates } });
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({ success: false, message: 'Failed to fetch templates' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const validatedData = ReportTemplateSchema.parse(body);

        const template = await prisma.reportTemplate.create({
            data: {
                name: validatedData.name,
                description: validatedData.description,
                config: JSON.stringify(validatedData.config),
                category: validatedData.category,
                isPublic: validatedData.isPublic,
                sharedWith: JSON.stringify(validatedData.sharedWith),
                tenantId: session.user.tenantId,
                createdById: session.user.id
            }
        });

        return NextResponse.json({ success: true, message: 'Template created', data: { template } }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: 'Validation error', errors: error.errors }, { status: 400 });
        }
        console.error('Error creating template:', error);
        return NextResponse.json({ success: false, message: 'Failed to create template' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const templateId = searchParams.get('id');
        if (!templateId) {
            return NextResponse.json({ success: false, message: 'Template ID required' }, { status: 400 });
        }

        const existing = await prisma.reportTemplate.findFirst({
            where: { id: templateId, tenantId: session.user.tenantId, createdById: session.user.id }
        });
        if (!existing) {
            return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
        }

        const body = await req.json();
        const validatedData = UpdateReportTemplateSchema.parse(body);
        const updateData: any = {};
        if (validatedData.name) updateData.name = validatedData.name;
        if (validatedData.description !== undefined) updateData.description = validatedData.description;
        if (validatedData.config) updateData.config = JSON.stringify(validatedData.config);
        if (validatedData.category) updateData.category = validatedData.category;
        if (validatedData.isPublic !== undefined) updateData.isPublic = validatedData.isPublic;
        if (validatedData.sharedWith) updateData.sharedWith = JSON.stringify(validatedData.sharedWith);

        const template = await prisma.reportTemplate.update({ where: { id: templateId }, data: updateData });
        return NextResponse.json({ success: true, message: 'Template updated', data: { template } });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, message: 'Validation error', errors: error.errors }, { status: 400 });
        }
        console.error('Error updating template:', error);
        return NextResponse.json({ success: false, message: 'Failed to update template' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const templateId = searchParams.get('id');
        if (!templateId) {
            return NextResponse.json({ success: false, message: 'Template ID required' }, { status: 400 });
        }

        const existing = await prisma.reportTemplate.findFirst({
            where: { id: templateId, tenantId: session.user.tenantId, createdById: session.user.id }
        });
        if (!existing) {
            return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
        }

        await prisma.reportTemplate.delete({ where: { id: templateId } });
        return NextResponse.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('Error deleting template:', error);
        return NextResponse.json({ success: false, message: 'Failed to delete template' }, { status: 500 });
    }
}
