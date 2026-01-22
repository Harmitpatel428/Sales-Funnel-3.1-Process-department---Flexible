/**
 * Integration Tests for API Key Authentication
 * Tests API key validation, scopes, rate limiting, and usage logging
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
        get: vi.fn(() => undefined),
    })),
}));

const mockIsDatabaseHealthy = vi.fn();
vi.mock('@/lib/db', () => ({
    prisma: {},
    isDatabaseHealthy: (...args: any[]) => mockIsDatabaseHealthy(...args),
}));

vi.mock('@/lib/middleware/rate-limiter', () => ({
    rateLimitMiddleware: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/auth', () => ({
    getSessionByToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/authConfig', () => ({
    SESSION_COOKIE_NAME: 'sf_session',
}));

vi.mock('@/lib/middleware/request-logger', () => ({
    logRequest: vi.fn(),
}));

vi.mock('@/lib/middleware/session-activity', () => ({
    updateSessionActivity: vi.fn().mockResolvedValue(undefined),
}));

const mockApiKeyAuthMiddleware = vi.fn();
vi.mock('@/lib/middleware/api-key-auth', () => ({
    apiKeyAuthMiddleware: (...args: any[]) => mockApiKeyAuthMiddleware(...args),
}));

const mockLogApiUsage = vi.fn();
vi.mock('@/lib/api-keys', () => ({
    logApiUsage: (...args: any[]) => mockLogApiUsage(...args),
    validateApiKey: vi.fn(),
}));

vi.mock('@/lib/api-rate-limiter', () => ({
    checkApiKeyRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    addRateLimitHeaders: vi.fn((res) => res),
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    auth: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/middleware/error-handler', () => ({
    handleApiError: vi.fn((error) =>
        NextResponse.json({ success: false, message: error.message }, { status: 500 })
    ),
    ValidationError: class extends Error { },
    AuthError: class extends Error { },
    ConflictError: class extends Error { },
    ServerError: class extends Error { },
    NetworkError: class extends Error { },
}));

// ============================================================================
// Imports
// ============================================================================

import { withApiHandler } from '@/lib/api/withApiHandler';
import { createMockApiKey, createMockRequest } from '../utils/test-helpers';

// ============================================================================
// Test Suite
// ============================================================================

describe('API Key Authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsDatabaseHealthy.mockResolvedValue(true);
        mockLogApiUsage.mockResolvedValue(undefined);
    });

    // ========================================================================
    // API Key Validation
    // ========================================================================

    describe('API Key Validation', () => {
        it('should allow request with valid API key', async () => {
            const apiKey = createMockApiKey();
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey,
                tenant: { id: 'tenant-123', name: 'Test Tenant' },
                scopes: ['leads:read', 'leads:write'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true, data: [] })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest('http://localhost:3000/api/leads', {
                headers: { 'x-api-key': 'valid-key' }
            });
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(handler).toHaveBeenCalled();

            const [, context] = handler.mock.calls[0];
            expect(context.apiKeyAuth).toBeDefined();
            expect(context.apiKeyAuth.apiKey.id).toBe(apiKey.id);
        });

        it('should return 401 for invalid API key', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json(
                    { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid or expired API key' } },
                    { status: 401 }
                )
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest('http://localhost:3000/api/leads', {
                headers: { 'x-api-key': 'invalid-key' }
            });
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            expect(handler).not.toHaveBeenCalled();

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error.code).toBe('INVALID_API_KEY');
        });

        it('should return 401 for missing API key', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json(
                    { success: false, error: { code: 'UNAUTHORIZED', message: 'API key required' } },
                    { status: 401 }
                )
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            expect(handler).not.toHaveBeenCalled();
        });

        it('should return 401 for expired API key', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json(
                    { success: false, error: { code: 'INVALID_API_KEY', message: 'API key has expired' } },
                    { status: 401 }
                )
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest('http://localhost:3000/api/leads', {
                headers: { 'x-api-key': 'expired-key' }
            });
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
        });

        it('should return 401 for revoked API key', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json(
                    { success: false, error: { code: 'INVALID_API_KEY', message: 'API key has been revoked' } },
                    { status: 401 }
                )
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest('http://localhost:3000/api/leads', {
                headers: { 'x-api-key': 'revoked-key' }
            });
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
        });
    });

    // ========================================================================
    // Scope Validation
    // ========================================================================

    describe('Scope Validation', () => {
        it('should allow request when API key has required scopes', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey: createMockApiKey({ scopes: ['leads:read'] }),
                tenant: { id: 'tenant-123' },
                scopes: ['leads:read'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                useApiKeyAuth: true,
                requiredScopes: ['leads:read']
            }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(handler).toHaveBeenCalled();
        });

        it('should return 403 when API key lacks required scopes', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json(
                    { success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Insufficient API key permissions' } },
                    { status: 403 }
                )
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({
                useApiKeyAuth: true,
                requiredScopes: ['leads:write']
            }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(403);
            expect(handler).not.toHaveBeenCalled();

            const body = await response.json();
            expect(body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        it('should allow read operation with leads:read scope', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey: createMockApiKey({ scopes: ['leads:read'] }),
                tenant: { id: 'tenant-123' },
                scopes: ['leads:read'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true, data: [] })
            );

            const wrappedHandler = withApiHandler({
                useApiKeyAuth: true,
                requiredScopes: ['leads:read']
            }, handler);
            const req = createMockRequest('http://localhost:3000/api/leads', { method: 'GET' });
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
        });

        it('should allow write operation with leads:write scope', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey: createMockApiKey({ scopes: ['leads:write'] }),
                tenant: { id: 'tenant-123' },
                scopes: ['leads:write'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true }, { status: 201 })
            );

            const wrappedHandler = withApiHandler({
                useApiKeyAuth: true,
                requiredScopes: ['leads:write']
            }, handler);
            const req = createMockRequest('http://localhost:3000/api/leads', {
                method: 'POST',
                body: { clientName: 'Test' }
            });
            const response = await wrappedHandler(req);

            expect(response.status).toBe(201);
        });

        it('should allow all operations with admin scope', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey: createMockApiKey({ scopes: ['admin'] }),
                tenant: { id: 'tenant-123' },
                scopes: ['admin'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                useApiKeyAuth: true,
                requiredScopes: ['leads:read', 'leads:write', 'documents:read']
            }, handler);
            const req = createMockRequest();

            // Admin scope should bypass specific scope requirements
            // (This depends on how apiKeyAuthMiddleware handles admin scope)
            const response = await wrappedHandler(req);
            expect(handler).toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Rate Limiting
    // ========================================================================

    describe('Rate Limiting', () => {
        it('should add rate limit headers to response', async () => {
            const apiKey = createMockApiKey({ rateLimit: 500 });
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey,
                tenant: { id: 'tenant-123' },
                scopes: ['leads:read'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.headers.get('X-RateLimit-Limit')).toBe('500');
        });

        it('should return 429 when rate limit exceeded', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json(
                    { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded', retryAfter: 60 } },
                    { status: 429 }
                )
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(429);
            expect(handler).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Usage Logging
    // ========================================================================

    describe('Usage Logging', () => {
        it('should log API usage for successful requests', async () => {
            const apiKey = createMockApiKey({ id: 'key-123' });
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey,
                tenant: { id: 'tenant-123' },
                scopes: ['leads:read'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true }, { status: 200 })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest('http://localhost:3000/api/leads', {
                headers: {
                    'x-api-key': 'test-key',
                    'x-forwarded-for': '10.0.0.1',
                    'user-agent': 'APIClient/2.0'
                }
            });
            await wrappedHandler(req);

            expect(mockLogApiUsage).toHaveBeenCalledWith(
                'key-123',
                '/api/leads',
                'GET',
                200,
                expect.any(Number),
                '10.0.0.1',
                'APIClient/2.0'
            );
        });

        it('should include response time in usage log', async () => {
            const apiKey = createMockApiKey({ id: 'key-123' });
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey,
                tenant: { id: 'tenant-123' },
                scopes: ['leads:read'],
            });

            const handler = vi.fn().mockImplementation(async () => {
                // Simulate some processing time
                await new Promise(resolve => setTimeout(resolve, 10));
                return NextResponse.json({ success: true });
            });

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            const [, , , , responseTime] = mockLogApiUsage.mock.calls[0];
            expect(responseTime).toBeGreaterThanOrEqual(0);
        });

        it('should handle usage logging errors gracefully', async () => {
            const apiKey = createMockApiKey();
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey,
                tenant: { id: 'tenant-123' },
                scopes: ['leads:read'],
            });

            mockLogApiUsage.mockRejectedValue(new Error('Logging failed'));

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();

            // Should not throw even if logging fails
            const response = await wrappedHandler(req);
            expect(response.status).toBe(200);
        });
    });

    // ========================================================================
    // API Key Context
    // ========================================================================

    describe('API Key Context', () => {
        it('should pass API key data to handler in context.apiKeyAuth', async () => {
            const apiKey = createMockApiKey({
                id: 'key-789',
                name: 'Production Key',
                scopes: ['leads:read', 'leads:write']
            });
            const tenant = { id: 'tenant-456', name: 'ACME Corp' };

            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey,
                tenant,
                scopes: ['leads:read', 'leads:write'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            const [, context] = handler.mock.calls[0];
            expect(context.apiKeyAuth.apiKey.id).toBe('key-789');
            expect(context.apiKeyAuth.apiKey.name).toBe('Production Key');
            expect(context.apiKeyAuth.tenant.id).toBe('tenant-456');
            expect(context.apiKeyAuth.scopes).toContain('leads:read');
        });

        it('should have null session when using API key auth', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue({
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123' },
                scopes: ['leads:read'],
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            const [, context] = handler.mock.calls[0];
            expect(context.session).toBeNull();
            expect(context.nextAuthSession).toBeNull();
        });
    });
});
