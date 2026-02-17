/**
 * Characterization Tests for Lead Routes
 * Captures current behavior of all lead endpoints before refactoring to declarative permissions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Mocks - Must be defined before imports
// ============================================================================

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
        get: vi.fn((name) =>
            name === 'sf_session' || name === 'session_token' ? { value: 'mock-session-token' } : undefined
        ),
    })),
}));

// Mock auth config
vi.mock('@/lib/authConfig', () => ({
    SESSION_COOKIE_NAME: 'sf_session',
}));

// Mock database
const mockPrisma = {
    lead: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
        create: vi.fn().mockResolvedValue({}),
    },
    user: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
    },
    validationBypassLog: {
        update: vi.fn().mockResolvedValue({}),
    },
    case: {
        create: vi.fn().mockResolvedValue({ caseId: 'case-123' }),
        findMany: vi.fn().mockResolvedValue([]),
    },
};

const mockIsDatabaseHealthy = vi.fn();
vi.mock('@/lib/db', () => ({
    prisma: mockPrisma,
    isDatabaseHealthy: (...args: any[]) => mockIsDatabaseHealthy(...args),
}));

// Mock rate limiter
const mockRateLimitMiddleware = vi.fn();
vi.mock('@/lib/middleware/rate-limiter', () => ({
    rateLimitMiddleware: (...args: any[]) => mockRateLimitMiddleware(...args),
}));

// Mock permissions
const mockGetUserPermissions = vi.fn();
const mockRequirePermissions = vi.fn();
const mockGetRecordLevelFilter = vi.fn();

vi.mock('@/lib/middleware/permissions', () => ({
    getUserPermissions: (...args: any[]) => mockGetUserPermissions(...args),
    requirePermissions: (...args: any[]) => mockRequirePermissions(...args),
    getRecordLevelFilter: (...args: any[]) => mockGetRecordLevelFilter(...args),
}));

// Mock auth / session adapter
const mockGetUnifiedSession = vi.fn();
vi.mock('@/lib/api/sessionAdapter', () => ({
    getUnifiedSession: (...args: any[]) => mockGetUnifiedSession(...args),
}));

// Mock workflow triggers
const mockTriggerWorkflows = vi.fn();
vi.mock('@/lib/workflows/triggers', () => ({
    TriggerManager: {
        triggerWorkflows: (...args: any[]) => mockTriggerWorkflows(...args),
    },
    EntityType: {
        LEAD: 'lead',
    },
}));

// Mock tenant context
vi.mock('@/lib/tenant', () => ({
    withTenant: vi.fn((tenantId, cb) => cb()),
}));

// Mock transaction
(mockPrisma as any).$transaction = vi.fn().mockImplementation((cb) => cb(mockPrisma));

// Mock websocket server
vi.mock('@/lib/websocket/server', () => ({
    emitLeadCreated: vi.fn().mockResolvedValue(undefined),
    emitLeadUpdated: vi.fn().mockResolvedValue(undefined),
    emitLeadDeleted: vi.fn().mockResolvedValue(undefined),
}));

// Mock idempotency
vi.mock('@/lib/middleware/idempotency', () => ({
    idempotencyMiddleware: vi.fn().mockResolvedValue(null),
    storeIdempotencyResult: vi.fn().mockResolvedValue(undefined),
}));

// Mock response helpers
vi.mock('@/lib/api/response-helpers', () => ({
    successResponse: vi.fn((data, message) =>
        NextResponse.json({ success: true, data, message }, { status: 200 })),
    errorResponse: vi.fn((message, errors, status = 500, code = 'INTERNAL_SERVER_ERROR') =>
        NextResponse.json({ success: false, error: code, message, errors }, { status })),
    notFoundResponse: vi.fn((entity) =>
        NextResponse.json({ success: false, error: 'NOT_FOUND', message: `${entity} not found` }, { status: 404 })),
    unauthorizedResponse: vi.fn(() =>
        NextResponse.json({ success: false, error: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 })),
    forbiddenResponse: vi.fn(() =>
        NextResponse.json({ success: false, error: 'FORBIDDEN', message: 'Forbidden' }, { status: 403 })),
    validationErrorResponse: vi.fn((errors) =>
        NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: 'Validation failed', errors }, { status: 400 })),
}));

// Mock error handler
vi.mock('@/lib/middleware/error-handler', () => ({
    handleApiError: vi.fn((error) => {
        console.error('Test API Error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }),
}));

// Mock API key middleware & rate limiter
vi.mock('@/lib/middleware/api-key-auth', () => ({
    apiKeyAuthMiddleware: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/api-keys', () => ({
    logApiUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/api-rate-limiter', () => ({
    checkApiKeyRateLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 100, remaining: 99, reset: Date.now() + 60000 }),
    addRateLimitHeaders: vi.fn((resp) => resp),
}));

// Mock validation bypass
vi.mock('@/lib/middleware/validation', () => ({
    validateBypassToken: vi.fn().mockResolvedValue({ valid: false }),
    formatValidationErrors: vi.fn((err) => ({ success: false, error: 'VALIDATION_ERROR', errors: [] })),
}));

// Mock request logger
vi.mock('@/lib/middleware/request-logger', () => ({
    logRequest: vi.fn(),
}));

// Mock session activity
const mockUpdateSessionActivity = vi.fn();
vi.mock('@/lib/middleware/session-activity', () => ({
    updateSessionActivity: (...args: any[]) => mockUpdateSessionActivity(...args),
}));

// Mock auth (getSessionByToken is used by withApiHandler for session authentication)
const mockGetSessionByToken = vi.fn();
vi.mock('@/lib/auth', () => ({
    getSessionByToken: (...args: any[]) => mockGetSessionByToken(...args),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
    createMockSession,
    createMockLead,
    createMockRequest,
} from '../utils/test-helpers';
import { PERMISSIONS } from '@/app/types/permissions';

// ============================================================================
// Test Suite
// ============================================================================

describe('Lead Routes Characterization', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock behaviors
        mockIsDatabaseHealthy.mockResolvedValue(true);
        mockRateLimitMiddleware.mockResolvedValue(null);
        mockGetUnifiedSession.mockResolvedValue(createMockSession());
        mockGetRecordLevelFilter.mockResolvedValue({});
        mockGetSessionByToken.mockResolvedValue(createMockSession());
        mockUpdateSessionActivity.mockResolvedValue(undefined);

        // Mock requirePermissions to return a function that returns null (authorized) by default
        mockRequirePermissions.mockReturnValue(() => Promise.resolve(null));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('GET /api/leads', () => {
        it('should return leads when authorized', async () => {
            const { GET } = await import('@/app/api/leads/route');
            const mockLeads = [createMockLead({ id: 'lead-1' }), createMockLead({ id: 'lead-2' })];

            mockPrisma.lead.findMany.mockResolvedValue(mockLeads);
            mockPrisma.lead.count.mockResolvedValue(2);

            const req = createMockRequest('http://localhost:3000/api/leads');
            const response = await GET(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data.leads).toHaveLength(2);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED, PERMISSIONS.LEADS_VIEW_ALL],
                false,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads'
                })
            );
        });

        it('should return 403 when permissions are missing', async () => {
            const { GET } = await import('@/app/api/leads/route');

            // Mock permission denial
            mockRequirePermissions.mockReturnValue(() =>
                Promise.resolve(NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }))
            );

            const req = createMockRequest('http://localhost:3000/api/leads');
            const response = await GET(req);

            expect(response.status).toBe(403);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED, PERMISSIONS.LEADS_VIEW_ALL],
                false,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads'
                })
            );
        });

        it('should apply record level filters', async () => {
            const { GET } = await import('@/app/api/leads/route');
            const session = createMockSession({ userId: 'user-456' });
            mockGetUnifiedSession.mockResolvedValue(session);
            mockGetRecordLevelFilter.mockResolvedValue({ assignedToId: 'user-456' });

            mockPrisma.lead.findMany.mockResolvedValue([]);
            mockPrisma.lead.count.mockResolvedValue(0);

            const req = createMockRequest('http://localhost:3000/api/leads');
            await GET(req);

            expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        assignedToId: 'user-456'
                    })
                })
            );
        });
    });

    describe('POST /api/leads', () => {
        it('should create a lead when authorized', async () => {
            const { POST } = await import('@/app/api/leads/route');
            const leadData = {
                company: 'Acme Corp',
                clientName: 'John Doe',
                mobileNumber: '1234567890',
                status: 'NEW'
            };

            mockPrisma.lead.create.mockResolvedValue({ id: 'new-lead-id', ...leadData });

            const req = createMockRequest('http://localhost:3000/api/leads', {
                method: 'POST',
                body: leadData
            });
            const response = await POST(req);

            expect(response.status).toBe(201);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_CREATE],
                true,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads'
                })
            );
        });
    });

    describe('GET /api/leads/[id]', () => {
        it('should return a specific lead', async () => {
            const { GET } = await import('@/app/api/leads/[id]/route');
            const mockLead = createMockLead({ id: 'lead-123' });
            mockPrisma.lead.findFirst.mockResolvedValue(mockLead);

            const req = createMockRequest('http://localhost:3000/api/leads/lead-123');
            const response = await GET(req, { params: Promise.resolve({ id: 'lead-123' }) });

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data.id).toBe('lead-123');
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED, PERMISSIONS.LEADS_VIEW_ALL],
                false,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads/lead-123'
                })
            );
        });
    });

    describe('PUT /api/leads/[id]', () => {
        it('should update a lead', async () => {
            const { PUT } = await import('@/app/api/leads/[id]/route');
            const mockLead = createMockLead({ id: 'lead-123', version: 1 });
            mockPrisma.lead.findFirst.mockResolvedValue(mockLead);
            mockPrisma.lead.update.mockResolvedValue({ ...mockLead, version: 2, company: 'Updated Co' });

            const req = createMockRequest('http://localhost:3000/api/leads/lead-123', {
                method: 'PUT',
                body: { version: 1, company: 'Updated Co' }
            });
            const response = await PUT(req, { params: Promise.resolve({ id: 'lead-123' }) });

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_EDIT_OWN, PERMISSIONS.LEADS_EDIT_ASSIGNED, PERMISSIONS.LEADS_EDIT_ALL],
                false,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads/lead-123'
                })
            );
        });
    });

    describe('DELETE /api/leads/[id]', () => {
        it('should soft delete a lead', async () => {
            const { DELETE } = await import('@/app/api/leads/[id]/route');
            const mockLead = createMockLead({ id: 'lead-123' });
            mockPrisma.lead.findFirst.mockResolvedValue(mockLead);
            mockPrisma.lead.update.mockResolvedValue({ ...mockLead, isDeleted: true });

            const req = createMockRequest('http://localhost:3000/api/leads/lead-123', {
                method: 'DELETE'
            });
            const response = await DELETE(req, { params: Promise.resolve({ id: 'lead-123' }) });

            expect(response.status).toBe(200);
            expect(mockPrisma.lead.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { isDeleted: true }
                })
            );
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_DELETE_OWN, PERMISSIONS.LEADS_DELETE_ALL],
                false,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads/lead-123'
                })
            );
        });
    });

    describe('POST /api/leads/[id]/assign', () => {
        it('should assign a lead', async () => {
            const { POST } = await import('@/app/api/leads/[id]/assign/route');
            const mockLead = createMockLead({ id: 'lead-123' });
            mockPrisma.lead.findFirst.mockResolvedValue(mockLead);
            mockPrisma.lead.update.mockResolvedValue({ ...mockLead, assignedToId: 'user-789' });

            const req = createMockRequest('http://localhost:3000/api/leads/lead-123/assign', {
                method: 'POST',
                body: { userId: 'user-789', version: 1 }
            });
            const response = await POST(req, { params: Promise.resolve({ id: 'lead-123' }) });

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_ASSIGN],
                true,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads/lead-123/assign'
                })
            );
        });
    });

    describe('POST /api/leads/[id]/forward', () => {
        it('should forward a lead', async () => {
            const { POST } = await import('@/app/api/leads/[id]/forward/route');
            const mockLead = createMockLead({ id: 'lead-123' });
            mockPrisma.lead.findFirst.mockResolvedValue(mockLead);
            // Forwarding involves transaction and case creation, but here we just check permission

            // Mock transaction
            vi.mocked(mockPrisma).$transaction = vi.fn().mockImplementation(cb => cb(mockPrisma));

            const req = createMockRequest('http://localhost:3000/api/leads/lead-123/forward', {
                method: 'POST',
                body: { benefitTypes: ['Solar'], reason: 'Expanding' }
            });
            const response = await POST(req, { params: Promise.resolve({ id: 'lead-123' }) });

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_FORWARD],
                true,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads/lead-123/forward'
                })
            );
        });
    });

    describe('POST /api/leads/[id]/unassign', () => {
        it('should reassign (unassign) a lead', async () => {
            const { POST } = await import('@/app/api/leads/[id]/unassign/route');
            const mockLead = createMockLead({ id: 'lead-123', assignedToId: 'user-456' });
            mockPrisma.lead.findFirst.mockResolvedValue(mockLead);
            mockPrisma.lead.update.mockResolvedValue({ ...mockLead, assignedToId: null });

            const req = createMockRequest('http://localhost:3000/api/leads/lead-123/unassign', {
                method: 'POST',
                body: { version: 1 }
            });
            const response = await POST(req, { params: Promise.resolve({ id: 'lead-123' }) });

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                [PERMISSIONS.LEADS_REASSIGN],
                true,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                    endpoint: '/api/leads/lead-123/unassign'
                })
            );
        });
    });
});
