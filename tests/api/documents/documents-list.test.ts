import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock dependencies
vi.mock('@/lib/db', () => ({
    prisma: {
        document: {
            findMany: vi.fn(),
            count: vi.fn(),
        }
    }
}));

vi.mock('@/lib/auth', () => ({
    getSessionByToken: vi.fn(),
}));

vi.mock('@/lib/tenant', () => ({
    withTenant: vi.fn((tenantId, cb) => cb()),
}));

vi.mock('@/lib/middleware/rate-limiter', () => ({
    rateLimitMiddleware: vi.fn(),
}));

vi.mock('@/lib/api/withApiHandler', () => ({
    withApiHandler: (options: any, handler: any) => {
        return async (req: NextRequest, ...args: any[]) => {
            const context = {
                req,
                session: { userId: 'user-1', tenantId: 'tenant-1', role: 'PROCESS_MANAGER' },
                headers: {},
                startTime: Date.now(),
                params: args[0]?.params
            };
            return handler(req, context);
        };
    }
}));

// Mock triggers just in case, though GET shouldn't use it
vi.mock('@/lib/workflows/triggers', () => ({
    TriggerManager: {
        triggerWorkflows: vi.fn(),
    },
    EntityType: { CASE: 'CASE' }
}));

// Mock ClamScan etc just in case imports cause issues
vi.mock('clamscan', () => ({ default: vi.fn() }));
vi.mock('tesseract.js', () => ({ default: vi.fn() }));
vi.mock('pdf-parse', () => ({ default: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: vi.fn() }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));


vi.mock('@/lib/storage', () => ({
    getStorageProvider: vi.fn(() => ({
        generatePresignedUrl: vi.fn().mockResolvedValue('http://mock-url'),
        uploadFile: vi.fn(),
        deleteFile: vi.fn(),
    })),
}));

import { GET } from '@/app/api/documents/route';

describe('Documents List API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should list documents', async () => {
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.document.findMany).mockResolvedValue([
            { id: 'doc-1', title: 'Doc 1', storageKey: 'key-1', storagePath: 'path/to/doc' }
        ] as any);
        vi.mocked(prisma.document.count).mockResolvedValue(1);

        const req = new NextRequest('http://localhost/api/documents?page=1&limit=10');
        const response = await GET(req, {});

        expect(response.status).toBe(200);
        const data = await response.json();
        // The handler returns { documents: [...], pagination: ... } directly
        expect(data.documents).toHaveLength(1);
        expect(data.pagination.total).toBe(1);
    });
});
