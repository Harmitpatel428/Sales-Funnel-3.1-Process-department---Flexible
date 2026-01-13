/**
 * Retention Policy Admin API
 * GET /api/admin/retention-policies - List policies
 * POST /api/admin/retention-policies - Create/Update policy
 * DELETE /api/admin/retention-policies - Delete policy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const RetentionPolicySchema = z.object({
    documentType: z.string().min(1),
    retentionPeriod: z.number().int().min(1),
    retentionUnit: z.enum(['DAYS', 'MONTHS', 'YEARS', 'PERMANENT']),
    autoDelete: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, tenantId: true }
        });

        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const policies = await prisma.retentionPolicy.findMany({
            where: { tenantId: user.tenantId },
            orderBy: { documentType: 'asc' }
        });

        return NextResponse.json({ policies });
    } catch (error) {
        console.error('Retention policies fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch policies' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, tenantId: true }
        });

        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const data = RetentionPolicySchema.parse(body);

        // Upsert policy
        const policy = await prisma.retentionPolicy.upsert({
            where: {
                tenantId_documentType: {
                    tenantId: user.tenantId,
                    documentType: data.documentType
                }
            },
            update: {
                retentionPeriod: data.retentionPeriod,
                retentionUnit: data.retentionUnit,
                autoDelete: data.autoDelete,
                updatedAt: new Date()
            },
            create: {
                tenantId: user.tenantId,
                documentType: data.documentType,
                retentionPeriod: data.retentionPeriod,
                retentionUnit: data.retentionUnit,
                autoDelete: data.autoDelete,
                createdById: session.user.id
            }
        });

        return NextResponse.json({ policy });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 });
        }
        console.error('Retention policy save error:', error);
        return NextResponse.json({ error: 'Failed to save policy' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, tenantId: true }
        });

        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const searchParams = req.nextUrl.searchParams;
        const documentType = searchParams.get('documentType');

        if (!documentType) {
            return NextResponse.json({ error: 'Document type is required' }, { status: 400 });
        }

        await prisma.retentionPolicy.delete({
            where: {
                tenantId_documentType: {
                    tenantId: user.tenantId,
                    documentType
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Retention policy delete error:', error);
        return NextResponse.json({ error: 'Failed to delete policy' }, { status: 500 });
    }
}
