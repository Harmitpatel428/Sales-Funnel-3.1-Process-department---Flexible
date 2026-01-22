/**
 * Single Document API Routes
 * GET /api/documents/[id] - Get document details
 * PATCH /api/documents/[id] - Update document
 * DELETE /api/documents/[id] - Soft delete document
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { getStorageProvider } from '@/lib/storage';
import { updateWithOptimisticLock, handleOptimisticLockError } from '@/lib/utils/optimistic-locking';
import { idempotencyMiddleware, storeIdempotencyResult } from '@/lib/middleware/idempotency';
import { emitDocumentUpdated, emitDocumentDeleted } from '@/lib/websocket/server';

import { DocumentUploadSchema, DocumentFiltersSchema } from '@/lib/validation/schemas';
import { validateDocumentCrossFields } from '@/lib/validation/cross-field-rules';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';

// Validation Schema
const DocumentUpdateSchema = z.object({
    version: z.number().int().min(1, 'Version is required for updates'),
    documentType: z.string().optional(),
    status: z.enum(['PENDING', 'RECEIVED', 'VERIFIED', 'REJECTED']).optional(),
    notes: z.string().optional(),
    rejectionReason: z.string().optional(),
});

// GET /api/documents/[id]
const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params if it's a promise (standard in Next.js 15+), or just access if resolved
    const params = await context.params;
    const { id } = params;

    // Get document
    const document = await prisma.document.findFirst({
        where: {
            id,
            tenantId: session.tenantId,
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
            userId: session.userId,
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
};

// PATCH /api/documents/[id]
const patchHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const { id } = params;

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
    if (idempotencyError) return idempotencyError;

    // Parse body
    const body = await req.json();
    const { version, ...updateData } = DocumentUpdateSchema.parse(body);

    // Get existing document
    const existing = await prisma.document.findFirst({
        where: {
            id,
            tenantId: session.tenantId,
            isDeleted: false,
        },
    });

    if (!existing) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Validate cross-field rules
    const mergedDocument = { ...existing, ...updateData };
    // Cast to any because validateDocumentCrossFields expects DocumentUpload shape which matches Document fields mostly
    const crossErrors = validateDocumentCrossFields(mergedDocument as any);
    if (crossErrors.length > 0) {
        return NextResponse.json({
            error: 'Validation error',
            details: crossErrors,
        }, { status: 400 });
    }

    try {
        // Prepare update data with verification fields
        const updatePayload: any = { ...updateData };
        if (updateData.status === 'VERIFIED') {
            updatePayload.verifiedById = session.userId;
            updatePayload.verifiedAt = new Date();
        }

        await updateWithOptimisticLock(
            prisma.document,
            { id, tenantId: session.tenantId },
            { currentVersion: version, data: updatePayload },
            'Document'
        );

        // Fetch with includes for response
        const fullDocument = await prisma.document.findUnique({
            where: { id },
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
                documentId: id,
                userId: session.userId,
                action: 'UPDATE',
                ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
                userAgent: req.headers.get('user-agent'),
            },
        });

        const response = NextResponse.json({
            success: true,
            document: {
                ...fullDocument,
                encryptionKey: undefined,
                encryptionIV: undefined,
            },
        });

        // WebSocket Broadcast
        try {
            if (fullDocument) {
                await emitDocumentUpdated(session.tenantId, fullDocument);
            }
        } catch (wsError) {
            console.error('[WebSocket] Document update broadcast failed:', wsError);
        }

        await storeIdempotencyResult(req, response);
        return response;

    } catch (error) {
        const lockError = handleOptimisticLockError(error);
        if (lockError) {
            return NextResponse.json(lockError, { status: 409 });
        }
        throw error;
    }
};

// DELETE /api/documents/[id]
const deleteHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const { id } = params;

    // Check idempotency
    const idempotencyError = await idempotencyMiddleware(req, session.tenantId);
    if (idempotencyError) return idempotencyError;

    // Get existing document
    const existing = await prisma.document.findFirst({
        where: {
            id,
            tenantId: session.tenantId,
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
            deletedById: session.userId,
        },
    });

    // Log access
    await prisma.documentAccessLog.create({
        data: {
            documentId: id,
            userId: session.userId,
            action: 'DELETE',
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
        },
    });

    // WebSocket Broadcast
    try {
        await emitDocumentDeleted(session.tenantId, id);
    } catch (wsError) {
        console.error('[WebSocket] Document delete broadcast failed:', wsError);
    }

    const response = NextResponse.json({
        success: true,
        message: 'Document deleted successfully',
    });

    await storeIdempotencyResult(req, response);
    return response;
};

export const GET = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 100 }, getHandler);
export const PATCH = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 30 }, patchHandler);
export const DELETE = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 30 }, deleteHandler);

