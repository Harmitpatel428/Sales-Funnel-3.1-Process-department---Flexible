/**
 * Wrapper Integration Tests for withApiHandler
 * Comprehensive tests covering wrapper option combinations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
}));

// Mock permissions
const mockRequirePermissions = vi.fn();
vi.mock('@/lib/middleware/permissions', () => ({
    requirePermissions: (...args: any[]) => mockRequirePermissions(...args),
}));

// Mock API key auth
const mockApiKeyAuthMiddleware = vi.fn();
vi.mock('@/lib/middleware/api-key-auth', () => ({
    apiKeyAuthMiddleware: (...args: any[]) => mockApiKeyAuthMiddleware(...args),
}));

// Mock API key rate limiter
const mockCheckApiKeyRateLimit = vi.fn();
const mockAddRateLimitHeaders = vi.fn();
vi.mock('@/lib/api-rate-limiter', () => ({
    checkApiKeyRateLimit: (...args: any[]) => mockCheckApiKeyRateLimit(...args),
    addRateLimitHeaders: (...args: any[]) => mockAddRateLimitHeaders(...args),
}));

// Mock API usage logging
const mockLogApiUsage = vi.fn();
vi.mock('@/lib/api-keys', () => ({
    logApiUsage: (...args: any[]) => mockLogApiUsage(...args),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { withApiHandler } from '@/lib/api/withApiHandler';
import {
    createMockSession,
    createMockRequest,
    createMockApiKey,
} from '../utils/test-helpers';

// ============================================================================
// Test Suite
// ============================================================================

describe('withApiHandler Wrapper Integration', () => {
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
        mockRequirePermissions.mockReturnValue(() => Promise.resolve(null));
        mockApiKeyAuthMiddleware.mockResolvedValue(null);
        mockCheckApiKeyRateLimit.mockResolvedValue({ allowed: true, limit: 100, remaining: 99, reset: Date.now() + 60000 });
        mockAddRateLimitHeaders.mockImplementation((resp) => resp);
        mockLogApiUsage.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // Permissions: requireAll vs Any
    // ========================================================================

    describe('Permissions: requireAll vs any', () => {
        it('should pass permissions with requireAll=true (all must match)', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                permissions: ['leads:view', 'leads:edit'],
                requireAll: true,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                ['leads:view', 'leads:edit'],
                true,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                })
            );
        });

        it('should pass permissions with requireAll=false (any can match)', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                permissions: ['leads:view', 'leads:edit'],
                requireAll: false,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                ['leads:view', 'leads:edit'],
                false,
                expect.objectContaining({
                    userId: 'user-123',
                    tenantId: 'tenant-123',
                })
            );
        });

        it('should default requireAll to true when not specified', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                permissions: ['leads:view'],
            }, handler);

            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockRequirePermissions).toHaveBeenCalledWith(
                ['leads:view'],
                true, // default
                expect.any(Object)
            );
        });

        it('should return 403 when permission check fails', async () => {
            mockRequirePermissions.mockReturnValue(() =>
                Promise.resolve(NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 }))
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({
                permissions: ['admin:all'],
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(403);
            expect(handler).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Permission Scopes: OWN/ASSIGNED/ALL
    // ========================================================================

    describe('Permission Scopes: OWN/ASSIGNED/ALL', () => {
        it('should handle LEADS_VIEW_OWN scope - user can only see own leads', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession({
                userId: 'user-123',
                role: 'SALES_REP'
            }));
            mockRequirePermissions.mockReturnValue(() => Promise.resolve(null));

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true, scope: 'OWN' })
            );

            const wrappedHandler = withApiHandler({
                permissions: ['LEADS_VIEW_OWN'],
                requireAll: true,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                ['LEADS_VIEW_OWN'],
                true,
                expect.objectContaining({ userId: 'user-123' })
            );
        });

        it('should handle LEADS_VIEW_ASSIGNED scope - user can see assigned leads', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession({
                userId: 'user-456',
                role: 'SALES_MANAGER'
            }));
            mockRequirePermissions.mockReturnValue(() => Promise.resolve(null));

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true, scope: 'ASSIGNED' })
            );

            const wrappedHandler = withApiHandler({
                permissions: ['LEADS_VIEW_ASSIGNED'],
                requireAll: true,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                ['LEADS_VIEW_ASSIGNED'],
                true,
                expect.objectContaining({ userId: 'user-456' })
            );
        });

        it('should handle LEADS_VIEW_ALL scope - admin can see all leads', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession({
                userId: 'admin-789',
                role: 'ADMIN'
            }));
            mockRequirePermissions.mockReturnValue(() => Promise.resolve(null));

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true, scope: 'ALL' })
            );

            const wrappedHandler = withApiHandler({
                permissions: ['LEADS_VIEW_ALL'],
                requireAll: true,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                ['LEADS_VIEW_ALL'],
                true,
                expect.objectContaining({ userId: 'admin-789' })
            );
        });

        it('should handle multi-scope with requireAll=false (any permission OK)', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession());
            mockRequirePermissions.mockReturnValue(() => Promise.resolve(null));

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                permissions: ['LEADS_VIEW_OWN', 'LEADS_VIEW_ASSIGNED'],
                requireAll: false, // Any one is sufficient
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                ['LEADS_VIEW_OWN', 'LEADS_VIEW_ASSIGNED'],
                false,
                expect.any(Object)
            );
        });

        it('should return 403 when user lacks required scope permission', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession({
                role: 'VIEWER'
            }));
            mockRequirePermissions.mockReturnValue(() =>
                Promise.resolve(NextResponse.json({
                    success: false,
                    error: 'FORBIDDEN',
                    message: 'Missing required permission: LEADS_VIEW_ALL'
                }, { status: 403 }))
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({
                permissions: ['LEADS_VIEW_ALL'],
                requireAll: true,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(403);
            expect(handler).not.toHaveBeenCalled();
            const body = await response.json();
            expect(body.error).toBe('FORBIDDEN');
        });
    });

    // ========================================================================
    // Tenant Checks and skipTenantCheck
    // ========================================================================

    describe('Tenant Context Validation', () => {
        it('should allow request when session has tenantId', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession({ tenantId: 'tenant-456' }));

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
        });

        it('should return 403 when session is missing tenantId', async () => {
            mockGetSessionByToken.mockResolvedValue({
                userId: 'user-123',
                role: 'ADMIN',
                sessionId: 'session-123',
                tenantId: null, // Missing tenant
            });

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(403);
            const body = await response.json();
            expect(body.message).toContain('Tenant context');
        });

        it('should skip tenant check when skipTenantCheck is true', async () => {
            mockGetSessionByToken.mockResolvedValue({
                userId: 'user-123',
                role: 'ADMIN',
                sessionId: 'session-123',
                tenantId: null, // Missing tenant but should be allowed
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ skipTenantCheck: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(handler).toHaveBeenCalled();
        });

        it('should skip tenant check for API key auth', async () => {
            const apiKeyAuth = {
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123', name: 'Test' },
                scopes: ['leads:read'],
            };
            mockApiKeyAuthMiddleware.mockResolvedValue(apiKeyAuth);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
        });
    });

    // ========================================================================
    // Response Format Validation Warnings
    // ========================================================================

    describe('Response Format Validation', () => {
        it('should log warning when JSON response is missing success field', async () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ data: 'test' }) // Missing 'success' field
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            // Wait for fire-and-forget validation
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Response missing "success" field'),
                expect.any(Array)
            );

            consoleWarnSpy.mockRestore();
        });

        it('should not log warning when JSON response has success field', async () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true, data: 'test' })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            // Wait for fire-and-forget validation
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(consoleWarnSpy).not.toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });

    // ========================================================================
    // Auth vs API Key Paths
    // ========================================================================

    describe('Auth Paths: Session vs API Key', () => {
        it('should use session auth by default', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockGetSessionByToken).toHaveBeenCalled();
            expect(mockApiKeyAuthMiddleware).not.toHaveBeenCalled();
        });

        it('should use API key auth when useApiKeyAuth is true', async () => {
            const apiKeyAuth = {
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123', name: 'Test' },
                scopes: ['leads:read'],
            };
            mockApiKeyAuthMiddleware.mockResolvedValue(apiKeyAuth);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockApiKeyAuthMiddleware).toHaveBeenCalled();
            expect(mockGetSessionByToken).not.toHaveBeenCalled();
        });

        it('should not update session activity for API key auth', async () => {
            const apiKeyAuth = {
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123', name: 'Test' },
                scopes: ['leads:read'],
            };
            mockApiKeyAuthMiddleware.mockResolvedValue(apiKeyAuth);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockUpdateSessionActivity).not.toHaveBeenCalled();
        });

        it('should use session rate limiting for session auth', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockRateLimitMiddleware).toHaveBeenCalled();
            expect(mockCheckApiKeyRateLimit).not.toHaveBeenCalled();
        });

        it('should use API key rate limiting for API key auth', async () => {
            const apiKeyAuth = {
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123', name: 'Test' },
                scopes: ['leads:read'],
            };
            mockApiKeyAuthMiddleware.mockResolvedValue(apiKeyAuth);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockCheckApiKeyRateLimit).toHaveBeenCalled();
            expect(mockRateLimitMiddleware).not.toHaveBeenCalled();
        });

        it('should return 401 when API key auth fails', async () => {
            mockApiKeyAuthMiddleware.mockResolvedValue(
                NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
            );

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            expect(handler).not.toHaveBeenCalled();
        });

        it('should add rate limit headers for API key auth', async () => {
            const apiKeyAuth = {
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123', name: 'Test' },
                scopes: ['leads:read'],
            };
            mockApiKeyAuthMiddleware.mockResolvedValue(apiKeyAuth);
            mockAddRateLimitHeaders.mockImplementation((resp, rl) => {
                resp.headers.set('X-RateLimit-Limit', rl.limit.toString());
                return resp;
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(mockAddRateLimitHeaders).toHaveBeenCalled();
        });

        it('should log API usage for API key auth', async () => {
            const apiKeyAuth = {
                apiKey: createMockApiKey(),
                tenant: { id: 'tenant-123', name: 'Test' },
                scopes: ['leads:read'],
            };
            mockApiKeyAuthMiddleware.mockResolvedValue(apiKeyAuth);

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({ useApiKeyAuth: true }, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            // Wait for fire-and-forget log
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockLogApiUsage).toHaveBeenCalledWith(
                apiKeyAuth.apiKey.id,
                expect.any(String), // pathname
                expect.any(String), // method
                200, // status
                expect.any(Number), // responseTime
                expect.any(String), // ipAddress
                expect.any(String)  // userAgent
            );
        });
    });

    // ========================================================================
    // Option Combinations
    // ========================================================================

    describe('Option Combinations', () => {
        it('should handle combined options: authRequired=false, checkDbHealth=true', async () => {
            mockIsDatabaseHealthy.mockResolvedValue(false);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({
                authRequired: false,
                checkDbHealth: true,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(503); // DB unhealthy
            expect(mockGetSessionByToken).not.toHaveBeenCalled();
        });

        it('should handle combined options: authRequired=true, permissions with requireAll=false', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                authRequired: true,
                permissions: ['leads:view', 'leads:create'],
                requireAll: false,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockGetSessionByToken).toHaveBeenCalled();
            expect(mockRequirePermissions).toHaveBeenCalledWith(
                ['leads:view', 'leads:create'],
                false,
                expect.any(Object)
            );
        });

        it('should handle combined options: skipTenantCheck=true, logRequest=false', async () => {
            mockGetSessionByToken.mockResolvedValue({
                userId: 'user-123',
                role: 'ADMIN',
                sessionId: 'session-123',
                tenantId: null,
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                skipTenantCheck: true,
                logRequest: false,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockLogRequest).not.toHaveBeenCalled();
        });

        it('should handle all disabled options', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                authRequired: false,
                checkDbHealth: false,
                rateLimit: false,
                logRequest: false,
                updateSessionActivity: false,
            }, handler);

            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(200);
            expect(mockIsDatabaseHealthy).not.toHaveBeenCalled();
            expect(mockRateLimitMiddleware).not.toHaveBeenCalled();
            expect(mockGetSessionByToken).not.toHaveBeenCalled();
            expect(mockLogRequest).not.toHaveBeenCalled();
            expect(mockUpdateSessionActivity).not.toHaveBeenCalled();
        });
    });
});
