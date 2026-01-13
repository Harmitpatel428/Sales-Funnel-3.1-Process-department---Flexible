import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    return NextResponse.json(event);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    await prisma.calendarEvent.update({
        where: { id }, // tenant check implicit usually
        data: {
            title: body.title,
            startTime: body.startTime ? new Date(body.startTime) : undefined,
            endTime: body.endTime ? new Date(body.endTime) : undefined,
            description: body.description,
            updatedAt: new Date()
        }
    });

    return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    await prisma.calendarEvent.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
