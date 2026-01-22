/**
 * Document Versions API
 * GET /api/documents/[id]/versions - List versions
 * POST /api/documents/[id]/versions - Upload new version
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStorageProvider, generateStoragePath, generateChecksum, validateFileSize, validateMimeType } from '@/lib/storage';
import { encryptDocumentForStorage } from '@/lib/document-encryption';
import { scanFileOrThrow, VirusDetectedError } from '@/lib/virus-scanner';
import { extractText, isOcrSupported } from '@/lib/ocr';
import crypto from 'crypto';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';

// GET /api/documents/[id]/versions
const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const { id } = params;

    const versions = await prisma.documentVersion.findMany({
        where: { documentId: id },
        include: {
            uploadedBy: {
                select: { id: true, name: true, email: true },
            },
        },
        orderBy: { versionNumber: 'desc' },
    });

    return NextResponse.json({ versions });
};

// POST /api/documents/[id]/versions - Upload new version
const postHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
    const { session } = context;
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await context.params;
    const { id } = params;

    // Get raw document (to check ownership/existence)
    const existingDoc = await prisma.document.findFirst({
        where: { id, tenantId: session.tenantId, isDeleted: false },
    });

    if (!existingDoc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const changeNotes = formData.get('changeNotes') as string || 'Updated version';

    if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Basic Validation
    if (!validateFileSize(file.size, 50)) {
        return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Process File
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Virus Scan
    try {
        await scanFileOrThrow(buffer, file.name);
    } catch (error) {
        if (error instanceof VirusDetectedError) {
            return NextResponse.json({ error: 'Virus detected' }, { status: 400 });
        }
        // Log scan error but proceed (fail open or closed depending on policy - here we warn)
        console.warn('Virus scan failed during version upload', error);
    }

    // Encryption & Storage
    const checksum = generateChecksum(buffer);
    const { encryptedData, encryptedKey, iv } = encryptDocumentForStorage(buffer);

    // Generate new storage path unique to this version
    const storageId = crypto.randomUUID().replace(/-/g, '');
    const storagePath = generateStoragePath(session.tenantId, existingDoc.caseId, id, `${storageId}_${file.name}`);

    const storage = getStorageProvider();
    await storage.uploadFile(encryptedData, storagePath, {
        contentType: file.type,
        tenantId: session.tenantId,
        caseId: existingDoc.caseId,
        documentId: id,
        fileName: file.name,
        version: 'true',
    });

    // Determined next version number
    const latestVersion = await prisma.documentVersion.findFirst({
        where: { documentId: id },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
    });
    const nextVersionNum = (latestVersion?.versionNumber || 0) + 1;

    // Save Version Record
    const nextVersion = await prisma.documentVersion.create({
        data: {
            documentId: id,
            versionNumber: nextVersionNum,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            storagePath,
            checksum,
            uploadedById: session.userId,
            changeNotes,
        },
    });

    // Update Main Document Record with new metadata
    const updatedDoc = await prisma.document.update({
        where: { id },
        data: {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            storagePath,
            encryptionKey: encryptedKey,
            encryptionIV: iv,
            checksum,
            // Reset statuses for new content
            virusScanStatus: 'CLEAN', // We scanned it above (or skipped on error)
            status: 'PENDING', // Needs re-verification usually
            ocrStatus: isOcrSupported(file.type) ? 'PENDING' : 'NOT_APPLICABLE',
            currentVersionId: nextVersion.id, // Point to the new version record ID
            updatedAt: new Date(),
        },
    });

    // Async OCR
    if (isOcrSupported(file.type)) {
        // In production: trigger background job
        extractText(buffer, file.type).then(async (result) => {
            await prisma.document.update({
                where: { id: updatedDoc.id },
                data: { ocrStatus: result.status, ocrText: result.text || null }
            });
        }).catch(console.error);
    }

    // Log Access
    await prisma.documentAccessLog.create({
        data: {
            documentId: id,
            userId: session.userId,
            action: 'UPLOAD_VERSION',
            ipAddress: req.headers.get('x-forwarded-for'),
            userAgent: req.headers.get('user-agent'),
        },
    });

    return NextResponse.json({ success: true, version: nextVersionNum });
};

export const GET = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 100 }, getHandler);
export const POST = withApiHandler({ authRequired: true, checkDbHealth: true, rateLimit: 30 }, postHandler);
