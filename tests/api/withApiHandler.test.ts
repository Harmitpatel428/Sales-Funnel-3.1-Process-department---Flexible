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
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // Phase 2: Database Health Check
    // ========================================================================

    describe('Database Health Check Phase', () => {
        it('should return 503 when database is unhealthy', async () => {
            mockIsDatabaseHealthy.mockResolvedValue(false);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(503);
            expect(handler).not.toHaveBeenCalled();
        });

        it('should proceed when database is healthy', async () => {
            mockIsDatabaseHealthy.mockResolvedValue(true);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(handler).toHaveBeenCalled();
        });

        it('should skip DB check when checkDbHealth is false', async () => {
            mockIsDatabaseHealthy.mockResolvedValue(false);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ checkDbHealth: false }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(mockIsDatabaseHealthy).not.toHaveBeenCalled();
            expect(response.status).toBe(200);
        });
    });

    // ========================================================================
    // Phase 3: Rate Limiting
    // ========================================================================

    describe('Rate Limiting Phase', () => {
        it('should return rate limit error when exceeded', async () => {
            const rateLimitResponse = NextResponse.json(
                { success: false, message: 'Too many requests' },
                { status: 429 }
            );
            mockRateLimitMiddleware.mockResolvedValue(rateLimitResponse);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(429);
            expect(handler).not.toHaveBeenCalled();
        });

        it('should proceed when rate limit is not exceeded', async () => {
            mockRateLimitMiddleware.mockResolvedValue(null);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
        });

        it('should skip rate limiting when rateLimit is false', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ rateLimit: false }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockRateLimitMiddleware).not.toHaveBeenCalled();
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
    // Phase 4: Authentication - Custom Session
    // ========================================================================

    describe('Custom Session Authentication', () => {
        it('should return 401 when session is invalid', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            expect(handler).not.toHaveBeenCalled();
        });

        it('should proceed when session is valid', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession());

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(handler).toHaveBeenCalled();
        });

        it('should pass session data to handler via context', async () => {
            const session = createMockSession({
                userId: 'user-456',
                role: 'SALES_MANAGER',
                tenantId: 'tenant-789'
            });
            mockGetSessionByToken.mockResolvedValue(session);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            const [, context] = handler.mock.calls[0];
            expect(context.session).toEqual(session);
        });
    });

    // ========================================================================
    // Phase 4: Authentication - NextAuth
    // ========================================================================

    describe('NextAuth Authentication', () => {
        it('should use NextAuth when useNextAuth is true and no custom session', async () => {
            // Ensure no custom session exists
            mockGetSessionByToken.mockResolvedValue(null);

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

            // Verify unified session is passed to handler (normalized from NextAuth)
            const [, context] = handler.mock.calls[0];
            expect(context.session).not.toBeNull();
            expect(context.session.userId).toBe(nextAuthSession.user.id);
            expect(context.session.role).toBe(nextAuthSession.user.role);
            // Session adapter generates synthetic sessionId for NextAuth
            expect(context.session.sessionId).toMatch(/^nextauth_/);
        });

        it('should return 401 when both custom session and NextAuth are missing', async () => {
            // No custom session
            mockGetSessionByToken.mockResolvedValue(null);

            const { auth } = await import('@/app/api/auth/[...nextauth]/route');
            (auth as Mock).mockResolvedValue(null);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({ useNextAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            expect(handler).not.toHaveBeenCalled();
        });

        it('should use custom session when both custom session and NextAuth exist (custom takes priority)', async () => {
            const customSession = createMockSession({ userId: 'custom-user' });
            mockGetSessionByToken.mockResolvedValue(customSession);

            const { auth } = await import('@/app/api/auth/[...nextauth]/route');
            const nextAuthSession = createMockNextAuthSession({ user: { id: 'nextauth-user' } });
            (auth as Mock).mockResolvedValue(nextAuthSession);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useNextAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(handler).toHaveBeenCalled();

            // Custom session should take priority
            const [, context] = handler.mock.calls[0];
            expect(context.session.userId).toBe('custom-user');
            // NextAuth should NOT have been called since custom session was found first
            expect(auth).not.toHaveBeenCalled();
        });

        it('should fall back to NextAuth when custom session returns null', async () => {
            // Custom session returns null
            mockGetSessionByToken.mockResolvedValue(null);

            const { auth } = await import('@/app/api/auth/[...nextauth]/route');
            const nextAuthSession = createMockNextAuthSession({ user: { id: 'nextauth-user' } });
            (auth as Mock).mockResolvedValue(nextAuthSession);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useNextAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(handler).toHaveBeenCalled();

            // Should use NextAuth session as fallback
            const [, context] = handler.mock.calls[0];
            expect(context.session.userId).toBe('nextauth-user');
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

        it('should skip activity update for NextAuth sessions', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const { auth } = await import('@/app/api/auth/[...nextauth]/route');
            const nextAuthSession = createMockNextAuthSession();
            (auth as Mock).mockResolvedValue(nextAuthSession);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useNextAuth: true }, handler);
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
