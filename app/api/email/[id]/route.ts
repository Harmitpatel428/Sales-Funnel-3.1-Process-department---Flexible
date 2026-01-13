import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const email = await prisma.email.findUnique({
        where: { id },
        include: { attachments: true }
    });

    if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

    // Tenant check
    const user = await prisma.user.findUnique({ where: { id: session.user.id as string } });
    if (email.tenantId !== user?.tenantId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json(email);
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { status, isRead } = body; // isRead logic: if read, set openedAt? Or we might have a separate 'read' flag if added to schema. 
    // Schema has openedAt. 

    // Basic update
    const email = await prisma.email.update({
        where: { id },
        data: {
            status: status || undefined,
            // If "read" action, we might update openedAt if it's null?
            openedAt: isRead ? new Date() : undefined
        }
    });

    return NextResponse.json(email);
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Logical delete or hard delete? Plan says "Soft delete or hard delete". 
    // Schema doesn't have isDeleted for Email (it does for Lead). 
    // Wait, let me check schema I added.
    // Email model has no isDeleted.
    // I'll hard delete for now or update status to 'DELETED' if status enum allows.
    // User plan said "add status default" but didn't list 'DELETED'. 
    // "DRAFT", "SENT", "FAILED", "BOUNCED".
    // I will hard delete for this MVP step.

    await prisma.email.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
