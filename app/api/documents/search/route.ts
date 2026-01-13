/**
 * Document Search API
 * GET /api/documents/search - Full-text search for documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { z } from 'zod';
import { getStorageProvider } from '@/lib/storage';

const SearchQuerySchema = z.object({
    q: z.string().min(1),
    caseId: z.string().optional(),
    status: z.string().optional(),
    documentType: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const start = Date.now();
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, tenantId: true },
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const { q, caseId, status, documentType, page, limit } = SearchQuerySchema.parse(
            Object.fromEntries(req.nextUrl.searchParams)
        );

        // Simple Prisma search (until FTS is enabled in SQLite via raw query or dedicated search engine)
        // We use OR condition for various text fields
        const where: any = {
            tenantId: user.tenantId,
            isDeleted: false,
            OR: [
                { fileName: { contains: q } }, // Case insensitive by default in some DBs, but explicit mode might be needed
                { notes: { contains: q } },
                { documentType: { contains: q } },
                { ocrText: { contains: q } }, // Full text search on OCR content
            ],
        };

        if (caseId) where.caseId = caseId;
        if (status) where.status = status;
        if (documentType) where.documentType = documentType;

        const [total, documents] = await Promise.all([
            prisma.document.count({ where }),
            prisma.document.findMany({
                where,
                select: {
                    id: true,
                    fileName: true,
                    documentType: true,
                    status: true,
                    createdAt: true,
                    fileSize: true,
                    ocrStatus: true,
                    storagePath: true,
                    // Don't return full OCR text in list to save bandwidth, just snippet could be good but Prisma doesn't support snippet easily
                    ocrText: false
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        // Generate preview URLs
        const storage = getStorageProvider();
        const docsWithUrls = await Promise.all(documents.map(async (doc) => ({
            ...doc,
            previewUrl: await storage.generatePresignedUrl(doc.storagePath, 900),
        })));

        return NextResponse.json({
            success: true,
            data: docsWithUrls,
            meta: {
                total,
                page,
                limit,
                duration: Date.now() - start,
            }
        });

    } catch (error) {
        console.error('Search error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid query', details: error.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}
