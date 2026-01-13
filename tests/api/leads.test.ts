import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock Auth
vi.mock('../../lib/auth', () => ({
    getSession: vi.fn(),
}));

// Mock DB (hoisted)
vi.mock('../../lib/db', () => ({
    prisma: {
        lead: {
            findMany: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
    },
}));

// Mock Rate Limiter
const mockRateLimitMiddleware = vi.fn();
vi.mock('../../lib/middleware/rate-limiter', () => ({
    rateLimitMiddleware: (...args: any[]) => mockRateLimitMiddleware(...args),
}));

// Mock Tenant
vi.mock('../../lib/tenant', () => ({
    withTenant: vi.fn((tenantId, callback) => callback()),
}));

// Mock Validation
vi.mock('../../lib/validation/schemas', () => ({
    LeadSchema: {},
    LeadFiltersSchema: {},
    validateRequest: vi.fn(() => ({ success: true, data: {} })),
}));

// Mock Permissions
vi.mock('../../lib/middleware/permissions', () => ({
    requirePermissions: vi.fn(() => () => null),
    getRecordLevelFilter: vi.fn(() => ({})),
}));

// Mock Error Handler
vi.mock('../../lib/middleware/error-handler', () => ({
    handleApiError: vi.fn((error) => NextResponse.json({ error: error.message }, { status: 500 })),
}));

// Mock Response Helpers
vi.mock('../../lib/api/response-helpers', () => ({
    successResponse: vi.fn((data) => NextResponse.json({ success: true, data }, { status: 200 })),
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })),
    validationErrorResponse: vi.fn((errors) => NextResponse.json({ errors }, { status: 400 })),
}));

// Mock Request Logger
vi.mock('../../lib/middleware/request-logger', () => ({
    logRequest: vi.fn(),
}));

import { GET, POST } from '../../app/api/leads/route';
import { prisma } from '../../lib/db';
const mockPrisma = prisma as any;

import { getSession } from '../../lib/auth';
import { POST as POST_ACTIVITY } from '../../app/api/leads/[id]/activities/route';

describe('Leads API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRateLimitMiddleware.mockResolvedValue(null); // Default success
    });

    describe('GET /api/leads', () => {
        it('should return 401 if not authenticated', async () => {
            (getSession as any).mockResolvedValue(null);
            const req = new NextRequest('http://localhost:3000/api/leads');
            const res = await GET(req);
            expect(res.status).toBe(401);
        });

        it('should return leads if authenticated', async () => {
            (getSession as any).mockResolvedValue({
                userId: 'test-user',
                role: 'ADMIN',
                tenantId: 'test-tenant',
            });

            mockPrisma.lead.findMany.mockResolvedValue([]);
            mockPrisma.lead.count.mockResolvedValue(0);

            const req = new NextRequest('http://localhost:3000/api/leads');
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.leads).toEqual([]);
        });
    });

    describe('POST /api/leads', () => {
        it('should create a lead', async () => {
            (getSession as any).mockResolvedValue({
                userId: 'test-user',
                role: 'ADMIN',
                tenantId: 'test-tenant',
            });

            const newLead = {
                id: 'lead-1',
                clientName: 'Test Client',
                company: 'Test Company',
                mobileNumber: '1234567890',
                status: 'NEW',
                tenantId: 'test-tenant'
            };

            mockPrisma.lead.create.mockResolvedValue(newLead);

            const req = new NextRequest('http://localhost:3000/api/leads', {
                method: 'POST',
                body: JSON.stringify({
                    clientName: 'Test Client',
                    company: 'Test Company',
                    mobileNumber: '1234567890'
                })
            });

            const res = await POST(req);
            const data = await res.json();

            expect(res.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.data.clientName).toBe('Test Client');
        });
    });

    describe('POST /api/leads/[id]/activities', () => {
        it('should enforce rate limiting', async () => {
            const limitResponse = NextResponse.json(
                { success: false, error: 'Too Many Requests' },
                { status: 429 }
            );
            mockRateLimitMiddleware.mockResolvedValue(limitResponse);

            const req = new NextRequest('http://localhost:3000/api/leads/123/activities', {
                method: 'POST',
                body: JSON.stringify({ note: 'Test' })
            });

            const res = await POST_ACTIVITY(req, { params: Promise.resolve({ id: '123' }) });
            expect(res.status).toBe(429);
            expect(mockRateLimitMiddleware).toHaveBeenCalled();
        });

        it('should add activity if allowed', async () => {
            (getSession as any).mockResolvedValue({
                userId: 'user-1',
                role: 'SALES_EXECUTIVE',
                tenantId: 'tenant-1'
            });

            mockPrisma.lead.findFirst.mockResolvedValue({
                id: '123',
                activities: '[]',
                tenantId: 'tenant-1'
            });
            mockPrisma.lead.update.mockResolvedValue({});

            const req = new NextRequest('http://localhost:3000/api/leads/123/activities', {
                method: 'POST',
                body: JSON.stringify({ type: 'NOTE', content: 'hello' })
            });

            const res = await POST_ACTIVITY(req, { params: Promise.resolve({ id: '123' }) });
            expect(res.status).toBe(200);
            expect(mockRateLimitMiddleware).toHaveBeenCalled();
            expect(mockPrisma.lead.update).toHaveBeenCalled();
        });
    });
});
