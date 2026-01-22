import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock dependencies
vi.mock('@/lib/db', () => ({
    prisma: {
        case: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            delete: vi.fn(),
            update: vi.fn(), // If used directly
        },
        auditLog: {
            create: vi.fn(),
        },
        user: {
            findFirst: vi.fn(),
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
    rateLimitMiddleware: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/middleware/idempotency', () => ({
    idempotencyMiddleware: vi.fn().mockResolvedValue(null),
    storeIdempotencyResult: vi.fn(),
}));

vi.mock('@/lib/workflows/triggers', () => ({
    TriggerManager: {
        triggerWorkflows: vi.fn(),
        EntityType: { CASE: 'CASE' }
    },
    EntityType: { CASE: 'CASE' }
}));

vi.mock('@/lib/websocket/server', () => ({
    emitCaseUpdated: vi.fn(),
    emitCaseDeleted: vi.fn(),
}));

// Mock withApiHandler to just call the handler directly for simpler unit testing of logic?
// OR test the wrapper too. Testing the wrapper is better.
// But withApiHandler uses complex internal logic. 
// Just in case, let's mock withApiHandler to return the handler to isolate business logic testing.
// This avoids testing the wrapper implementation which isn't the focus (wrapper is trusted).
vi.mock('@/lib/api/withApiHandler', () => ({
    withApiHandler: (options: any, handler: any) => {
        return async (req: NextRequest, ...args: any[]) => {
            // Manually construct context as wrapper would
            const context = {
                req,
                session: { userId: 'user-1', tenantId: 'tenant-1', role: 'PROCESS_MANAGER' }, // Mock session
                headers: {},
                startTime: Date.now(),
                params: args[0]?.params // correctly pass params
            };
            return handler(req, context);
        };
    }
}));

// Import AFTER mocks
import { GET, PUT, DELETE } from '@/app/api/cases/[id]/route';

describe('Cases [id] API', () => {
    const mockCase = {
        caseId: 'case-123',
        tenantId: 'tenant-1',
        assignedProcessUserId: 'user-1',
        processStatus: 'NEW',
        benefitTypes: JSON.stringify(['Pension']),
        contacts: JSON.stringify([]),
        originalLeadData: JSON.stringify({}),
        users: { id: 'user-1', name: 'Test User' }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET', () => {
        it('should return case data when found', async () => {
            const { prisma } = await import('@/lib/db');
            vi.mocked(prisma.case.findFirst).mockResolvedValue(mockCase as any);

            const req = new NextRequest('http://localhost/api/cases/case-123');
            const params = Promise.resolve({ id: 'case-123' });

            const response = await GET(req, { params });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.data.caseId).toBe('case-123');
            expect(data.data.benefitTypes).toEqual(['Pension']);
        });

        it('should return 404 when not found', async () => {
            const { prisma } = await import('@/lib/db');
            vi.mocked(prisma.case.findFirst).mockResolvedValue(null);

            const req = new NextRequest('http://localhost/api/cases/case-999');
            const params = Promise.resolve({ id: 'case-999' });

            const response = await GET(req, { params });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE', () => {
        it('should delete case if admin', async () => {
            const { prisma } = await import('@/lib/db');
            // Mock session is PROCESS_MANAGER in withApiHandler mock above

            const req = new NextRequest('http://localhost/api/cases/case-123', { method: 'DELETE' });
            const params = Promise.resolve({ id: 'case-123' });

            const response = await DELETE(req, { params });

            expect(response.status).toBe(200);
            expect(prisma.case.delete).toHaveBeenCalledWith({ where: { caseId: 'case-123' } });
        });
    });
});
