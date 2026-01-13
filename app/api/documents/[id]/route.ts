/**
 * Single Document API Routes
 * GET /api/documents/[id] - Get document details
 * PATCH /api/documents/[id] - Update document
 * DELETE /api/documents/[id] - Soft delete document
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';
import { getStorageProvider } from '@/lib/storage';

// Validation Schema
const DocumentUpdateSchema = z.object({
    documentType: z.string().optional(),
    status: z.enum(['PENDING', 'RECEIVED', 'VERIFIED', 'REJECTED']).optional(),
    notes: z.string().optional(),
    rejectionReason: z.string().optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/documents/[id]
export async function GET(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Authenticate
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user with tenant
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, tenantId: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get document
        const document = await prisma.document.findFirst({
            where: {
                id,
                tenantId: user.tenantId,
                isDeleted: false,
            },
            include: {
                uploadedBy: {
                    select: { id: true, name: true, email: true },
                },
                verifiedBy: {
                    select: { id: true, name: true, email: true },
                },
                versions: {
                    include: {
                        uploadedBy: {
                            select: { id: true, name: true },
                        },
                    },
                    orderBy: { versionNumber: 'desc' },
                },
            },
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Log access
        await prisma.documentAccessLog.create({
            data: {
                documentId: document.id,
                userId: user.id,
                action: 'VIEW',
                ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
                userAgent: req.headers.get('user-agent'),
            },
        });

        // Generate pre-signed URL
        const storage = getStorageProvider();
        const previewUrl = await storage.generatePresignedUrl(document.storagePath, 900);

        return NextResponse.json({
            document: {
                ...document,
                previewUrl,
                encryptionKey: undefined,
                encryptionIV: undefined,
            },
        });

    } catch (error) {
        console.error('Get document error:', error);
        return NextResponse.json({
            error: 'Failed to get document',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

// PATCH /api/documents/[id]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Authenticate
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user with tenant
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, tenantId: true, role: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Parse body
        const body = await req.json();
        const updates = DocumentUpdateSchema.parse(body);

        // Get existing document
        const existing = await prisma.document.findFirst({
            where: {
                id,
                tenantId: user.tenantId,
                isDeleted: false,
            },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Update document
        const document = await prisma.document.update({
            where: { id },
            data: {
                ...updates,
                // If status changes to VERIFIED, set verifiedBy
                ...(updates.status === 'VERIFIED' && {
                    verifiedById: user.id,
                    verifiedAt: new Date(),
                }),
            },
            include: {
                uploadedBy: {
                    select: { id: true, name: true, email: true },
                },
                verifiedBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        // Log access
        await prisma.documentAccessLog.create({
            data: {
                documentId: document.id,
                userId: user.id,
                action: 'UPDATE',
                ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
                userAgent: req.headers.get('user-agent'),
            },
        });

        return NextResponse.json({
            success: true,
            document: {
                ...document,
                encryptionKey: undefined,
                encryptionIV: undefined,
            },
        });

    } catch (error) {
        console.error('Update document error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({
                error: 'Validation error',
                details: error.errors,
            }, { status: 400 });
        }
        return NextResponse.json({
            error: 'Failed to update document',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

// DELETE /api/documents/[id]
export async function DELETE(req: NextRequest, { params }: RouteParams) {
    try {
        const { id } = await params;

        // Authenticate
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user with tenant
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, tenantId: true, role: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get existing document
        const existing = await prisma.document.findFirst({
            where: {
                id,
                tenantId: user.tenantId,
                isDeleted: false,
            },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Soft delete
        await prisma.document.update({
            where: { id },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedById: user.id,
            },
        });

        // Log access
        await prisma.documentAccessLog.create({
            data: {
                documentId: id,
                userId: user.id,
                action: 'DELETE',
                ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
                userAgent: req.headers.get('user-agent'),
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Document deleted successfully',
        });

    } catch (error) {
        console.error('Delete document error:', error);
        return NextResponse.json({
            error: 'Failed to delete document',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
