/**
 * Unit Tests for withApiHandler Wrapper
 * Comprehensive tests covering all middleware phases
 */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Mocks - Must be defined before imports
// ============================================================================

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
        get: vi.fn((name) => ({ value: 'mock-session-token' })),
    })),
}));

// Mock database
const mockIsDatabaseHealthy = vi.fn();
vi.mock('@/lib/db', () => ({
    prisma: {},
    isDatabaseHealthy: (...args: any[]) => mockIsDatabaseHealthy(...args),
}));

// Mock rate limiter
const mockRateLimitMiddleware = vi.fn();
vi.mock('@/lib/middleware/rate-limiter', () => ({
    rateLimitMiddleware: (...args: any[]) => mockRateLimitMiddleware(...args),
}));

// Mock auth
const mockGetSessionByToken = vi.fn();
vi.mock('@/lib/auth', () => ({
    getSessionByToken: (...args: any[]) => mockGetSessionByToken(...args),
}));

// Mock auth config
vi.mock('@/lib/authConfig', () => ({
    SESSION_COOKIE_NAME: 'sf_session',
}));

// Mock request logger
const mockLogRequest = vi.fn();
vi.mock('@/lib/middleware/request-logger', () => ({
    logRequest: (...args: any[]) => mockLogRequest(...args),
}));

// Mock session activity
const mockUpdateSessionActivity = vi.fn();
vi.mock('@/lib/middleware/session-activity', () => ({
    updateSessionActivity: (...args: any[]) => mockUpdateSessionActivity(...args),
}));

// Mock error handler
const mockHandleApiError = vi.fn();
vi.mock('@/lib/middleware/error-handler', () => ({
    handleApiError: (...args: any[]) => mockHandleApiError(...args),
    ValidationError: class ValidationError extends Error {
        errors: any[];
        constructor(message: string, errors: any[] = []) {
            super(message);
            this.name = 'ValidationError';
            this.errors = errors;
        }
    },
    AuthError: class AuthError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'AuthError';
        }
    },
    ConflictError: class ConflictError extends Error {
        details: any;
        constructor(message: string, details?: any) {
            super(message);
            this.name = 'ConflictError';
            this.details = details;
        }
    },
    ServerError: class ServerError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'ServerError';
        }
    },
    NetworkError: class NetworkError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'NetworkError';
        }
    },
}));

// Mock API key auth
const mockApiKeyAuthMiddleware = vi.fn();
vi.mock('@/lib/middleware/api-key-auth', () => ({
    apiKeyAuthMiddleware: (...args: any[]) => mockApiKeyAuthMiddleware(...args),
}));

// Mock API usage logging
const mockLogApiUsage = vi.fn();
vi.mock('@/lib/api-keys', () => ({
    logApiUsage: (...args: any[]) => mockLogApiUsage(...args),
}));

// Mock NextAuth
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    auth: vi.fn().mockResolvedValue(null),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { withApiHandler } from '@/lib/api/withApiHandler';
import { cookies } from 'next/headers';
import {
    createMockSession,
    createMockRequest,
    createMockApiKey,
    createMockNextAuthSession,
} from '../utils/test-helpers';

// ============================================================================
// Test Suite
// ============================================================================

describe('withApiHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock behaviors
        mockIsDatabaseHealthy.mockResolvedValue(true);
        mockRateLimitMiddleware.mockResolvedValue(null);
        mockGetSessionByToken.mockResolvedValue(createMockSession());
        mockLogRequest.mockReturnValue(undefined);
        mockUpdateSessionActivity.mockResolvedValue(undefined);
        mockHandleApiError.mockImplementation((error) =>
            NextResponse.json({ success: false, message: error.message }, { status: 500 })
        );
        mockLogApiUsage.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // Phase 2: Database Health Check
    // ========================================================================

    describe('Database Health Check Phase', () => {
        it('should allow request when database is healthy', async () => {
            mockIsDatabaseHealthy.mockResolvedValue(true);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true, data: 'test' })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(mockIsDatabaseHealthy).toHaveBeenCalled();
            expect(handler).toHaveBeenCalled();
            expect(response.status).toBe(200);
        });

        it('should return 503 when database is unhealthy', async () => {
            mockIsDatabaseHealthy.mockResolvedValue(false);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(mockIsDatabaseHealthy).toHaveBeenCalled();
            expect(handler).not.toHaveBeenCalled();
            expect(response.status).toBe(503);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('SERVICE_UNAVAILABLE');
            expect(body.message).toBe('Service temporarily unavailable');
        });

        it('should skip health check when checkDbHealth is false', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ checkDbHealth: false }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockIsDatabaseHealthy).not.toHaveBeenCalled();
            expect(handler).toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Phase 3: Rate Limiting
    // ========================================================================

    describe('Rate Limiting Phase', () => {
        it('should allow request when rate limit is not exceeded', async () => {
            mockRateLimitMiddleware.mockResolvedValue(null);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(mockRateLimitMiddleware).toHaveBeenCalledWith(req, 100); // default rate limit
            expect(handler).toHaveBeenCalled();
            expect(response.status).toBe(200);
        });

        it('should return 429 when rate limit is exceeded', async () => {
            const rateLimitResponse = NextResponse.json(
                { success: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too Many Requests' },
                {
                    status: 429,
                    headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '60' }
                }
            );
            mockRateLimitMiddleware.mockResolvedValue(rateLimitResponse);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(429);
            expect(handler).not.toHaveBeenCalled();
        });

        it('should skip rate limiting when rateLimit is false', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ rateLimit: false }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockRateLimitMiddleware).not.toHaveBeenCalled();
            expect(handler).toHaveBeenCalled();
        });

        it('should use custom rate limit value', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ rateLimit: 50 }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockRateLimitMiddleware).toHaveBeenCalledWith(req, 50);
        });
    });

    // ========================================================================
    // Phase 4: Authentication - Custom Session Auth
    // ========================================================================

    describe('Custom Session Authentication', () => {
        it('should allow request with valid session', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(mockGetSessionByToken).toHaveBeenCalled();
            expect(handler).toHaveBeenCalled();
            expect(response.status).toBe(200);

            // Verify session is passed to handler
            const [, context] = handler.mock.calls[0];
            expect(context.session).toEqual(session);
        });

        it('should return 401 when session is missing', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            expect(handler).not.toHaveBeenCalled();

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('UNAUTHORIZED');
        });

        it('should pass session data to handler in context.session', async () => {
            const session = createMockSession({ userId: 'custom-user', role: 'SALES_EXECUTIVE' });
            mockGetSessionByToken.mockResolvedValue(session);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            const [, context] = handler.mock.calls[0];
            expect(context.session.userId).toBe('custom-user');
            expect(context.session.role).toBe('SALES_EXECUTIVE');
        });
    });

    // ========================================================================
    // Phase 4: Authentication - NextAuth
    // ========================================================================

    describe('NextAuth Authentication', () => {
        it('should use NextAuth when useNextAuth is true', async () => {
            const { auth } = await import('@/app/api/auth/[...nextauth]/route');
            const nextAuthSession = createMockNextAuthSession();
            (auth as Mock).mockResolvedValue(nextAuthSession);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useNextAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(auth).toHaveBeenCalled();
            expect(handler).toHaveBeenCalled();
            expect(response.status).toBe(200);

            // Verify NextAuth session is passed to handler
            const [, context] = handler.mock.calls[0];
            expect(context.nextAuthSession).toEqual(nextAuthSession);
            expect(context.session).toBeNull();
        });

        it('should return 401 when NextAuth session is missing', async () => {
            const { auth } = await import('@/app/api/auth/[...nextauth]/route');
            (auth as Mock).mockResolvedValue(null);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({ useNextAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            expect(handler).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Phase 4: Authentication - API Key Auth
    // ========================================================================

    describe('API Key Authentication', () => {
        it('should use API key auth when useApiKeyAuth is true', async () => {
            const apiKeyResult = {
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123', name: 'Test Tenant' },
                scopes: ['leads:read', 'leads:write'],
            };
            mockApiKeyAuthMiddleware.mockResolvedValue(apiKeyResult);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest('http://localhost:3000/api/leads', {
                headers: { 'x-api-key': 'test-api-key' }
            });
            const response = await wrappedHandler(req);

            expect(mockApiKeyAuthMiddleware).toHaveBeenCalled();
            expect(handler).toHaveBeenCalled();
            expect(response.status).toBe(200);

            // Verify API key auth is passed to handler
            const [, context] = handler.mock.calls[0];
            expect(context.apiKeyAuth).toEqual(apiKeyResult);
            expect(context.session).toBeNull();
        });

        it('should return 401 when API key is invalid', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json(
                    { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } },
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

        it('should return 403 when API key has insufficient scopes', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json(
                    { success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Insufficient permissions' } },
                    { status: 403 }
                )
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({
                useApiKeyAuth: true,
                requiredScopes: ['admin']
            }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(403);
            expect(handler).not.toHaveBeenCalled();
        });

        it('should pass required scopes to apiKeyAuthMiddleware', async () => {
            const apiKeyResult = {
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123' },
                scopes: ['leads:read'],
            };
            mockApiKeyAuthMiddleware.mockResolvedValue(apiKeyResult);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const requiredScopes = ['leads:read'];
            const wrappedHandler = withApiHandler({
                useApiKeyAuth: true,
                requiredScopes
            }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockApiKeyAuthMiddleware).toHaveBeenCalledWith(req, requiredScopes);
        });
    });

    // ========================================================================
    // Phase 4: Authentication - Public Endpoints
    // ========================================================================

    describe('Public Endpoints', () => {
        it('should allow request without authentication when authRequired is false', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ authRequired: false }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(mockGetSessionByToken).not.toHaveBeenCalled();
            expect(handler).toHaveBeenCalled();
            expect(response.status).toBe(200);

            // Verify context.session is null
            const [, context] = handler.mock.calls[0];
            expect(context.session).toBeNull();
        });
    });

    // ========================================================================
    // Phase 5: Request Logging
    // ========================================================================

    describe('Request Logging Phase', () => {
        it('should call logRequest with correct parameters', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true }, { status: 200 })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            // Initial log call (before handler)
            expect(mockLogRequest).toHaveBeenCalledWith(req, session);

            // Success log call (after handler)
            expect(mockLogRequest).toHaveBeenCalledTimes(2);
        });

        it('should skip logging when logRequest is false', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ logRequest: false }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockLogRequest).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Phase 6: Session Activity Update
    // ========================================================================

    describe('Session Activity Update Phase', () => {
        it('should call updateSessionActivity for custom session auth', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession());

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockUpdateSessionActivity).toHaveBeenCalledWith(req);
        });

        it('should skip activity update for API key auth', async () => {
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

            expect(mockUpdateSessionActivity).not.toHaveBeenCalled();
        });

        it('should skip activity update when updateSessionActivity is false', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession());

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ updateSessionActivity: false }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockUpdateSessionActivity).not.toHaveBeenCalled();
        });

        it('should catch and log activity update errors (fire-and-forget)', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession());
            mockUpdateSessionActivity.mockRejectedValue(new Error('Activity update failed'));

            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            // Handler should still succeed
            expect(response.status).toBe(200);
            expect(handler).toHaveBeenCalled();

            // Wait for promises to settle
            await new Promise(resolve => setTimeout(resolve, 10));

            consoleErrorSpy.mockRestore();
        });
    });

    // ========================================================================
    // Phase 7: Handler Execution
    // ========================================================================

    describe('Handler Execution Phase', () => {
        it('should pass correct ApiContext to handler', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            const [passedReq, context] = handler.mock.calls[0];

            expect(passedReq).toBe(req);
            expect(context.req).toBe(req);
            expect(context.session).toEqual(session);
            expect(context.nextAuthSession).toBeNull();
            expect(context.apiKeyAuth).toBeNull();
            expect(typeof context.startTime).toBe('number');
        });

        it('should return handler response unchanged', async () => {
            const responseData = { success: true, data: { id: 'test-123', name: 'Test' } };
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json(responseData, { status: 201 })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(201);
            const body = await response.json();
            expect(body).toEqual(responseData);
        });

        it('should pass route params to handler via context.params', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const routeContext = { params: { id: 'lead-123' } };
            await wrappedHandler(req, routeContext);

            const [, context] = handler.mock.calls[0];
            expect(context.params).toEqual({ id: 'lead-123' });
        });
    });

    // ========================================================================
    // Phase 8: Error Handling
    // ========================================================================

    describe('Error Handling Phase', () => {
        it('should catch handler errors and pass to handleApiError', async () => {
            const testError = new Error('Handler failed');
            const handler = vi.fn().mockRejectedValue(testError);

            mockHandleApiError.mockReturnValue(
                NextResponse.json({ success: false, message: 'Handler failed' }, { status: 500 })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(mockHandleApiError).toHaveBeenCalledWith(testError);
            expect(response.status).toBe(500);
        });

        it('should log errors via logRequest with error details', async () => {
            const testError = new Error('Test error');
            const handler = vi.fn().mockRejectedValue(testError);

            mockHandleApiError.mockReturnValue(
                NextResponse.json({ success: false }, { status: 500 })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            // Check that logRequest was called with error info
            expect(mockLogRequest).toHaveBeenCalledWith(
                req,
                expect.anything(),
                expect.objectContaining({
                    error: 'Test error',
                    level: 'ERROR'
                })
            );
        });
    });

    // ========================================================================
    // API Key Usage Logging
    // ========================================================================

    describe('API Key Usage Logging', () => {
        it('should log API usage for API key authenticated requests', async () => {
            const apiKey = createMockApiKey({ id: 'key-456', rateLimit: 1000 });
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
                    'x-forwarded-for': '192.168.1.1',
                    'user-agent': 'TestClient/1.0'
                }
            });

            await wrappedHandler(req);

            expect(mockLogApiUsage).toHaveBeenCalledWith(
                'key-456',
                '/api/leads',
                'GET',
                200,
                expect.any(Number),
                '192.168.1.1',
                'TestClient/1.0'
            );
        });

        it('should add rate limit headers for API key auth responses', async () => {
            const apiKey = createMockApiKey({ rateLimit: 1000 });
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

            expect(response.headers.get('X-RateLimit-Limit')).toBe('1000');
        });
    });

    // ========================================================================
    // Option Defaults
    // ========================================================================

    describe('Default Options', () => {
        it('should use default options when not specified', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            // Default: checkDbHealth = true
            expect(mockIsDatabaseHealthy).toHaveBeenCalled();

            // Default: rateLimit = 100
            expect(mockRateLimitMiddleware).toHaveBeenCalledWith(req, 100);

            // Default: authRequired = true (uses custom session)
            expect(mockGetSessionByToken).toHaveBeenCalled();

            // Default: logRequest = true
            expect(mockLogRequest).toHaveBeenCalled();

            // Default: updateSessionActivity = true
            expect(mockUpdateSessionActivity).toHaveBeenCalled();
        });
    });
});
