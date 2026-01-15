/**
 * Document Download API
 * GET /api/documents/[id]/download - Generate secure download URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getStorageProvider } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ id: string }>;
}

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
          userId: user.id,
          action: 'DOWNLOAD',
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          userAgent: req.headers.get('user-agent'),
        },
      });

      // Return file stream
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': document.mimeType,
          'Content-Disposition': `attachment; filename="${document.fileName}"`,
        },
      });

    } catch (err) {
      console.error('Decryption/Download failed:', err);
      return NextResponse.json({ error: 'Failed to process document' }, { status: 500 });
    }
  } catch (error) {
    console.error('Document download error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
