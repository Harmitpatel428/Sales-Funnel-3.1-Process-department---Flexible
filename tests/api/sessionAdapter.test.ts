/**
 * Unit Tests for Session Adapter Module
 * Tests the unified session handling for both custom session and NextAuth authentication
 */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { NextRequest } from 'next/server';

// ============================================================================
// Mocks - Must be defined before imports
// ============================================================================

// Mock next/headers
const mockCookiesGet = vi.fn();
vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
        get: mockCookiesGet,
    })),
}));

// Mock getSessionByToken
const mockGetSessionByToken = vi.fn();
vi.mock('@/lib/auth', () => ({
    getSessionByToken: (...args: any[]) => mockGetSessionByToken(...args),
}));

// Mock auth config
vi.mock('@/lib/authConfig', () => ({
    SESSION_COOKIE_NAME: 'sf_session',
}));

// Mock NextAuth
const mockNextAuth = vi.fn();
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    auth: () => mockNextAuth(),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { getUnifiedSession, normalizeNextAuthSession } from '@/lib/api/sessionAdapter';
import {
    createMockSession,
    createMockRequest,
    createMockNextAuthSession,
} from '../utils/test-helpers';

// ============================================================================
// Test Suite
// ============================================================================

describe('sessionAdapter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: no session token in cookie
        mockCookiesGet.mockReturnValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // normalizeNextAuthSession Tests
    // ========================================================================

    describe('normalizeNextAuthSession', () => {
        it('should normalize NextAuth session to CustomSessionData', () => {
            const nextAuthSession = createMockNextAuthSession({
                user: {
                    id: 'user-456',
                    email: 'test@example.com',
                    name: 'Test User',
                    role: 'ADMIN',
                }
            });
            // Add tenantId to the user for this test
            (nextAuthSession.user as any).tenantId = 'tenant-789';

            const result = normalizeNextAuthSession(nextAuthSession);

            expect(result.userId).toBe('user-456');
            expect(result.role).toBe('ADMIN');
            expect(result.tenantId).toBe('tenant-789');
            expect(result.sessionId).toMatch(/^nextauth_/);
        });

        it('should map NextAuth user.role to role correctly', () => {
            const nextAuthSession = createMockNextAuthSession({
                user: {
                    id: 'user-123',
                    role: 'SALES_EXECUTIVE',
                }
            });

            const result = normalizeNextAuthSession(nextAuthSession);

            expect(result.role).toBe('SALES_EXECUTIVE');
        });

        it('should handle missing role with default value', () => {
            const nextAuthSession = {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    // No role property
                },
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };

            const result = normalizeNextAuthSession(nextAuthSession as any);

            expect(result.role).toBe('USER');
        });

        it('should extract tenantId from NextAuth user if present', () => {
            const nextAuthSession = {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    tenantId: 'tenant-abc',
                },
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };

            const result = normalizeNextAuthSession(nextAuthSession as any);

            expect(result.tenantId).toBe('tenant-abc');
        });

        it('should handle missing tenantId gracefully (return undefined)', () => {
            const nextAuthSession = createMockNextAuthSession({
                user: {
                    id: 'user-123',
                    // No tenantId property
                }
            });

            const result = normalizeNextAuthSession(nextAuthSession);

            expect(result.tenantId).toBeUndefined();
        });

        it('should generate synthetic sessionId from user.id', () => {
            const nextAuthSession = createMockNextAuthSession({
                user: { id: 'user-test-123' }
            });

            const result = normalizeNextAuthSession(nextAuthSession);

            expect(result.sessionId).toMatch(/^nextauth_/);
            expect(result.sessionId.length).toBeGreaterThan(10);
        });

        it('should throw error when user object is missing', () => {
            const nextAuthSession = {
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };

            expect(() => normalizeNextAuthSession(nextAuthSession as any))
                .toThrow('NextAuth session missing user object');
        });

        it('should throw error when user.id is missing', () => {
            const nextAuthSession = {
                user: {
                    email: 'test@example.com',
                    // No id property
                },
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };

            expect(() => normalizeNextAuthSession(nextAuthSession as any))
                .toThrow('NextAuth user missing id');
        });
    });

    // ========================================================================
    // getUnifiedSession - Custom Session Path Tests
    // ========================================================================

    describe('getUnifiedSession - Custom Session Path', () => {
        it('should return custom session when useNextAuth is false', async () => {
            const customSession = createMockSession();
            mockCookiesGet.mockReturnValue({ value: 'mock-session-token' });
            mockGetSessionByToken.mockResolvedValue(customSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, false);

            expect(result).toEqual(customSession);
            expect(mockGetSessionByToken).toHaveBeenCalledWith('mock-session-token');
        });

        it('should extract session token from cookies correctly', async () => {
            const customSession = createMockSession();
            mockCookiesGet.mockReturnValue({ value: 'my-specific-token' });
            mockGetSessionByToken.mockResolvedValue(customSession);

            const req = createMockRequest();
            await getUnifiedSession(req, false);

            expect(mockGetSessionByToken).toHaveBeenCalledWith('my-specific-token');
        });

        it('should return null when no session token exists', async () => {
            mockCookiesGet.mockReturnValue(undefined);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, false);

            expect(result).toBeNull();
            expect(mockGetSessionByToken).not.toHaveBeenCalled();
        });

        it('should return null when session token is invalid', async () => {
            mockCookiesGet.mockReturnValue({ value: 'invalid-token' });
            mockGetSessionByToken.mockResolvedValue(null);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, false);

            expect(result).toBeNull();
        });

        it('should preserve all session fields (userId, role, sessionId, tenantId)', async () => {
            const customSession = createMockSession({
                userId: 'unique-user',
                role: 'SALES_MANAGER',
                sessionId: 'unique-session',
                tenantId: 'unique-tenant',
            });
            mockCookiesGet.mockReturnValue({ value: 'token' });
            mockGetSessionByToken.mockResolvedValue(customSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, false);

            expect(result).toEqual({
                userId: 'unique-user',
                role: 'SALES_MANAGER',
                sessionId: 'unique-session',
                tenantId: 'unique-tenant',
            });
        });
    });

    // ========================================================================
    // getUnifiedSession - NextAuth Path Tests
    // ========================================================================

    describe('getUnifiedSession - NextAuth Path', () => {
        it('should return normalized NextAuth session when useNextAuth is true and no custom session', async () => {
            // No custom session
            mockCookiesGet.mockReturnValue(undefined);
            mockGetSessionByToken.mockResolvedValue(null);

            const nextAuthSession = createMockNextAuthSession({
                user: {
                    id: 'nextauth-user',
                    role: 'ADMIN',
                }
            });
            (nextAuthSession.user as any).tenantId = 'nextauth-tenant';
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result).not.toBeNull();
            expect(result?.userId).toBe('nextauth-user');
            expect(result?.role).toBe('ADMIN');
            expect(result?.tenantId).toBe('nextauth-tenant');
        });

        it('should map NextAuth user.id to userId correctly when no custom session', async () => {
            mockCookiesGet.mockReturnValue(undefined);
            const nextAuthSession = createMockNextAuthSession({
                user: { id: 'special-id-123' }
            });
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result?.userId).toBe('special-id-123');
        });

        it('should map NextAuth user.role to role correctly when no custom session', async () => {
            mockCookiesGet.mockReturnValue(undefined);
            const nextAuthSession = createMockNextAuthSession({
                user: { id: 'user-1', role: 'TELECALLER' }
            });
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result?.role).toBe('TELECALLER');
        });

        it('should handle missing role with default value when no custom session', async () => {
            mockCookiesGet.mockReturnValue(undefined);
            const nextAuthSession = {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                },
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result?.role).toBe('USER');
        });

        it('should extract tenantId from NextAuth user if present when no custom session', async () => {
            mockCookiesGet.mockReturnValue(undefined);
            const nextAuthSession = {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    tenantId: 'my-tenant-id',
                },
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result?.tenantId).toBe('my-tenant-id');
        });

        it('should handle missing tenantId gracefully when no custom session', async () => {
            mockCookiesGet.mockReturnValue(undefined);
            const nextAuthSession = createMockNextAuthSession({
                user: { id: 'user-123' }
            });
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result?.tenantId).toBeUndefined();
        });

        it('should generate synthetic sessionId from user.id when no custom session', async () => {
            mockCookiesGet.mockReturnValue(undefined);
            const nextAuthSession = createMockNextAuthSession({
                user: { id: 'test-user-id' }
            });
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result?.sessionId).toMatch(/^nextauth_/);
        });
    });

    // ========================================================================
    // getUnifiedSession - Fallback Behavior Tests
    // ========================================================================

    describe('getUnifiedSession - Fallback Behavior', () => {
        it('should fall back to NextAuth when custom session returns null', async () => {
            // Custom session returns null
            mockCookiesGet.mockReturnValue({ value: 'invalid-token' });
            mockGetSessionByToken.mockResolvedValue(null);

            const nextAuthSession = createMockNextAuthSession({
                user: { id: 'nextauth-user' }
            });
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result?.userId).toBe('nextauth-user');
            expect(mockNextAuth).toHaveBeenCalled();
        });

        it('should try custom session first when useNextAuth is true', async () => {
            const customSession = createMockSession({ userId: 'custom-user' });
            mockCookiesGet.mockReturnValue({ value: 'token' });
            mockGetSessionByToken.mockResolvedValue(customSession);

            const nextAuthSession = createMockNextAuthSession({
                user: { id: 'nextauth-user' }
            });
            mockNextAuth.mockResolvedValue(nextAuthSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            // Custom session should take priority
            expect(result?.userId).toBe('custom-user');
            // NextAuth should NOT be called since custom session exists
            expect(mockNextAuth).not.toHaveBeenCalled();
        });

        it('should not call NextAuth when useNextAuth is false', async () => {
            mockCookiesGet.mockReturnValue({ value: 'token' });
            mockGetSessionByToken.mockResolvedValue(createMockSession());

            const req = createMockRequest();
            await getUnifiedSession(req, false);

            expect(mockNextAuth).not.toHaveBeenCalled();
        });

        it('should return null when both custom session and NextAuth fail', async () => {
            mockCookiesGet.mockReturnValue(undefined);
            mockNextAuth.mockResolvedValue(null);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result).toBeNull();
        });
    });

    // ========================================================================
    // getUnifiedSession - Edge Cases Tests
    // ========================================================================

    describe('getUnifiedSession - Edge Cases', () => {
        it('should handle malformed NextAuth session objects by falling back', async () => {
            // Session without proper user object
            const malformedSession = {
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
            mockNextAuth.mockResolvedValue(malformedSession);
            mockCookiesGet.mockReturnValue({ value: 'fallback-token' });
            const customSession = createMockSession();
            mockGetSessionByToken.mockResolvedValue(customSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            // Should fall back to custom session
            expect(result).toEqual(customSession);
        });

        it('should handle missing user object in NextAuth session by falling back', async () => {
            const sessionWithoutUser = { expires: 'some-date' };
            mockNextAuth.mockResolvedValue(sessionWithoutUser);
            mockCookiesGet.mockReturnValue({ value: 'token' });
            const customSession = createMockSession();
            mockGetSessionByToken.mockResolvedValue(customSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            expect(result).toEqual(customSession);
        });

        it('should handle empty cookie values', async () => {
            mockCookiesGet.mockReturnValue({ value: '' });

            const req = createMockRequest();
            const result = await getUnifiedSession(req, false);

            expect(result).toBeNull();
        });

        it('should handle concurrent session types (custom session takes priority)', async () => {
            const nextAuthSession = createMockNextAuthSession({
                user: { id: 'nextauth-user', role: 'ADMIN' }
            });
            const customSession = createMockSession({ userId: 'custom-user' });

            mockNextAuth.mockResolvedValue(nextAuthSession);
            mockCookiesGet.mockReturnValue({ value: 'token' });
            mockGetSessionByToken.mockResolvedValue(customSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            // Custom session should take priority
            expect(result?.userId).toBe('custom-user');
            // NextAuth should NOT be called
            expect(mockNextAuth).not.toHaveBeenCalled();
        });

        it('should handle NextAuth throwing error gracefully when no custom session', async () => {
            // No custom session
            mockCookiesGet.mockReturnValue(undefined);
            mockNextAuth.mockRejectedValue(new Error('NextAuth configuration error'));

            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            const req = createMockRequest();
            const result = await getUnifiedSession(req, true);

            // Should return null when NextAuth fails and no custom session
            expect(result).toBeNull();
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });

        it('should default useNextAuth to false', async () => {
            mockCookiesGet.mockReturnValue({ value: 'token' });
            const customSession = createMockSession();
            mockGetSessionByToken.mockResolvedValue(customSession);

            const req = createMockRequest();
            const result = await getUnifiedSession(req);

            expect(result).toEqual(customSession);
            expect(mockNextAuth).not.toHaveBeenCalled();
        });
    });
});
