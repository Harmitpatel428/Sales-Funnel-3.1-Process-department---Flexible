/**
 * Document Download API
 * GET /api/documents/[id]/download - Generate secure download URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { ApiHandler, ApiContext } from '@/lib/api/types';
import { PERMISSIONS } from '@/app/types/permissions';

const getHandler: ApiHandler = async (req: NextRequest, context: ApiContext) => {
  const { session } = context;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = await context.params;
  const { id } = params;

  // Get document
  const document = await prisma.document.findFirst({
    where: {
      id,
      tenantId: session.tenantId,
      isDeleted: false,
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      storagePath: true,
      encryptionKey: true,
      encryptionIV: true,
    },
  });

  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  try {
    // Download encrypted file from storage
    const storage = getStorageProvider();
    const encryptedBuffer = await storage.downloadFile(document.storagePath);

    // Decrypt file
    const { decryptDocumentFromStorage } = await import('@/lib/document-encryption');
    let fileBuffer: Buffer;

    if (document.encryptionKey && document.encryptionIV) {
      fileBuffer = decryptDocumentFromStorage(
        encryptedBuffer,
        document.encryptionKey,
        document.encryptionIV
      );
    } else {
      // Fallback for unencrypted files (if any)
      fileBuffer = encryptedBuffer;
    }

    // Log access
    await prisma.documentAccessLog.create({
      data: {
        documentId: document.id,
        userId: session.userId,
        action: 'DOWNLOAD',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
      },
    });

    // Return file stream
    return new NextResponse(fileBuffer as any, {
      headers: {
        'Content-Type': document.mimeType,
        'Content-Disposition': `attachment; filename="${document.fileName}"`,
      },
    });

  } catch (err) {
    console.error('Decryption/Download failed:', err);
    return NextResponse.json({ error: 'Failed to process document' }, { status: 500 });
  }
};

export const GET = withApiHandler({
  authRequired: true,
  checkDbHealth: true,
  rateLimit: 50,
  permissions: [PERMISSIONS.DOCUMENTS_DOWNLOAD]
}, getHandler);
