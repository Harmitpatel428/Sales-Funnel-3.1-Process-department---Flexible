/**
 * Document API Routes
 * POST /api/documents - Upload new document
 * GET /api/documents - List documents with filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';
import { getStorageProvider, getStorageConfig, generateStoragePath, generateChecksum, validateFileSize, validateMimeType as validateMimeTypeHelper } from '@/lib/storage';
import { encryptDocumentForStorage } from '@/lib/document-encryption';
import { scanFileOrThrow, VirusDetectedError, ScanFailedError } from '@/lib/virus-scanner';
import { extractText, isOcrSupported } from '@/lib/ocr';
import { calculateRetentionDate } from '@/lib/retention-policy';
import { emitDocumentCreated } from '@/lib/websocket/server';
import { DocumentUploadSchema, DocumentFiltersSchema } from '@/lib/validation/schemas';
import { validateDocumentCrossFields } from '@/lib/validation/cross-field-rules';
import { withValidation, ValidatedRequest } from '@/lib/middleware/validation';
import { validationErrorResponse } from '@/lib/api/response-helpers';

// POST /api/documents - Upload document
// Note: Manually handles FormData, so not using withValidation middleware for body parsing
export async function POST(req: NextRequest) {
    try {
        // Authenticate
        const session = await auth();
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

        // Parse multipart form data
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const metadataStr = formData.get('metadata') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Construct data for validation
        let metadata: any = {};
        try {
            metadata = metadataStr ? JSON.parse(metadataStr) : {};
        } catch (e) {
            return NextResponse.json({ error: 'Invalid metadata JSON' }, { status: 400 });
        }

        const validationData = {
            ...metadata,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type
        };

        // Validate against centralized schema
        const validation = DocumentUploadSchema.safeParse(validationData);
        if (!validation.success) {
            return validationErrorResponse(validation.error.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message,
                code: 'VALIDATION_ERROR'
            })));
        }

        const data = validation.data;

        // Cross-field validation
        const crossErrors = validateDocumentCrossFields(data);
        if (crossErrors.length > 0) {
            return validationErrorResponse(crossErrors);
        }

        // Legacy Helper Checks (redundant but safe)
        if (!validateFileSize(file.size, 50)) {
            // Schema max check handles this, but maybe strict 50MB env check
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Virus scan
        let virusScanStatus = 'PENDING';
        let virusScanResult = null;

        try {
            const scanResult = await scanFileOrThrow(buffer, file.name);
            virusScanStatus = scanResult.status;
            virusScanResult = JSON.stringify(scanResult);
        } catch (error) {
            if (error instanceof VirusDetectedError) {
                return NextResponse.json({
                    error: 'Virus detected',
                    virusName: error.scanResult.virusName,
                    details: error.scanResult.details,
                }, { status: 400 });
            }
            if (error instanceof ScanFailedError) {
                console.error('Virus scan failed:', error.message);
                virusScanStatus = 'FAILED';
                virusScanResult = JSON.stringify(error.scanResult);
            }
        }

        // Generate checksum
        const checksum = generateChecksum(buffer);

        // Encrypt document
        const { encryptedData, encryptedKey, iv } = encryptDocumentForStorage(buffer);

        // Generate storage path
        const documentId = crypto.randomUUID().replace(/-/g, '');
        const storagePath = generateStoragePath(
            user.tenantId,
            data.caseId,
            documentId,
            file.name
        );

        // Calculate retention expiration
        const expiresAt = await calculateRetentionDate(user.tenantId, data.documentType);

        // Upload to storage
        const storage = getStorageProvider();
        await storage.uploadFile(encryptedData, storagePath, {
            contentType: file.type,
            tenantId: user.tenantId,
            caseId: data.caseId,
            documentId,
            fileName: file.name,
        });

        // Create document record
        const document = await prisma.document.create({
            data: {
                id: documentId,
                tenantId: user.tenantId,
                caseId: data.caseId,
                documentType: data.documentType,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                storageProvider: getStorageConfig().provider,
                storagePath,
                encryptionKey: encryptedKey,
                encryptionIV: iv,
                checksum,
                status: 'PENDING',
                virusScanStatus,
                virusScanResult,
                ocrStatus: isOcrSupported(file.type) ? 'PENDING' : 'NOT_APPLICABLE',
                uploadedById: user.id,
                notes: data.notes,
                expiresAt: expiresAt,
            },
            include: {
                uploadedBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        // Create initial version
        await prisma.documentVersion.create({
            data: {
                documentId: document.id,
                versionNumber: 1,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                storagePath,
                checksum,
                uploadedById: user.id,
                changeNotes: 'Initial upload',
            },
        });

        // Log access
        await prisma.documentAccessLog.create({
            data: {
                documentId: document.id,
                userId: user.id,
                action: 'UPLOAD',
                ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
                userAgent: req.headers.get('user-agent'),
            },
        });

        // Start OCR processing asynchronously
        if (isOcrSupported(file.type)) {
            processOcrAsync(document.id, buffer, file.type).catch(console.error);
        }

        // WebSocket Broadcast
        try {
            await emitDocumentCreated(user.tenantId, document);
        } catch (wsError) {
            console.error('[WebSocket] Document creation broadcast failed:', wsError);
        }

        // Generate pre-signed URL for immediate preview
        const previewUrl = await storage.generatePresignedUrl(storagePath, 900);

        return NextResponse.json({
            success: true,
            document: {
                ...document,
                previewUrl,
                encryptionKey: undefined,
                encryptionIV: undefined,
            },
        }, { status: 201 });

    } catch (error) {
        console.error('Document upload error:', error);
        return NextResponse.json({
            error: 'Failed to upload document',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

// GET /api/documents - List documents
export const GET = withValidation(DocumentFiltersSchema)(async (req: ValidatedRequest<z.infer<typeof DocumentFiltersSchema>>) => {
    try {
        // Authenticate
        const session = await auth();
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

        const filters = req.validatedData;

        // Build where clause
        const where: any = {
            tenantId: user.tenantId,
            isDeleted: false,
        };

        if (filters.caseId) {
            where.caseId = filters.caseId;
        }

        if (filters.status) {
            where.status = filters.status;
        }

        if (filters.documentType) {
            where.documentType = filters.documentType;
        }

        if (filters.search) {
            where.OR = [
                { fileName: { contains: filters.search } },
                { documentType: { contains: filters.search } },
                { ocrText: { contains: filters.search } },
            ];
        }

        // Get total count
        const total = await prisma.document.count({ where });

        // Get documents
        const documents = await prisma.document.findMany({
            where,
            include: {
                uploadedBy: {
                    select: { id: true, name: true, email: true },
                },
                verifiedBy: {
                    select: { id: true, name: true, email: true },
                },
                _count: {
                    select: { versions: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: ((filters.page || 1) - 1) * (filters.limit || 20),
            take: filters.limit || 20,
        });

        // Generate pre-signed URLs for previews
        const storage = getStorageProvider();
        const documentsWithUrls = await Promise.all(
            documents.map(async (doc) => ({
                ...doc,
                previewUrl: await storage.generatePresignedUrl(doc.storagePath, 900),
                encryptionKey: undefined,
                encryptionIV: undefined,
            }))
        );

        return NextResponse.json({
            documents: documentsWithUrls,
            pagination: {
                page: filters.page,
                limit: filters.limit,
                total,
                totalPages: Math.ceil(total / (filters.limit || 20)),
            },
        });

    } catch (error) {
        console.error('Document list error:', error);
        return NextResponse.json({
            error: 'Failed to list documents',
            details: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
});

// Async OCR processing
async function processOcrAsync(documentId: string, buffer: Buffer, mimeType: string) {
    try {
        const result = await extractText(buffer, mimeType);

        await prisma.document.update({
            where: { id: documentId },
            data: {
                ocrStatus: result.status,
                ocrText: result.text || null,
            },
        });
    } catch (error) {
        console.error('OCR processing error:', error);
        await prisma.document.update({
            where: { id: documentId },
            data: {
                ocrStatus: 'FAILED',
            },
        });
    }
}
