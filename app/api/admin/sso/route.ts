
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const providers = await prisma.sSOProvider.findMany({
            where: { tenantId: session.tenantId },
        });
        return NextResponse.json(providers);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const data = await req.json();
        // Basic validation
        if (!data.name || !data.type) {
            return NextResponse.json({ error: 'Name and Type are required' }, { status: 400 });
        }

        const provider = await prisma.sSOProvider.create({
            data: {
                tenantId: session.tenantId,
                name: data.name,
                type: data.type,
                metadataUrl: data.metadataUrl,
                clientId: data.clientId,
                clientSecret: data.clientSecret,
                issuer: data.issuer,
                acsUrl: data.acsUrl,
                entityId: data.entityId,
                authorizationUrl: data.authorizationUrl,
                tokenUrl: data.tokenUrl,
                userInfoUrl: data.userInfoUrl,
            }
        });

        return NextResponse.json(provider);
    } catch (error: any) {
        console.error("Create SSO Provider Error", error);
        return NextResponse.json({ error: 'Failed to create provider' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const data = await req.json();
        if (!data.id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        // Ensure we only update if belongs to tenant
        const existing = await prisma.sSOProvider.findUnique({
            where: { id: data.id }
        });

        if (!existing || existing.tenantId !== session.tenantId) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        const provider = await prisma.sSOProvider.update({
            where: { id: data.id },
            data: {
                name: data.name,
                type: data.type,
                metadataUrl: data.metadataUrl,
                clientId: data.clientId,
                clientSecret: data.clientSecret,
                issuer: data.issuer,
                acsUrl: data.acsUrl,
                entityId: data.entityId,
                authorizationUrl: data.authorizationUrl,
                tokenUrl: data.tokenUrl,
                userInfoUrl: data.userInfoUrl,
            }
        });

        return NextResponse.json(provider);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        // Ensure we only delete if belongs to tenant
        const existing = await prisma.sSOProvider.findUnique({
            where: { id }
        });

        if (!existing || existing.tenantId !== session.tenantId) {
            return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
        }

        await prisma.sSOProvider.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 });
    }
}
