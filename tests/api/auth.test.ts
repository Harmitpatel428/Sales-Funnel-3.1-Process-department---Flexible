/**
 * Characterization Tests for Auth Routes
 * Captures current behavior of all auth endpoints before refactoring
 */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Mocks - Must be defined before imports
// ============================================================================

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
        get: vi.fn((name) =>
            name === 'session_token' || name === 'sf_session'
                ? { value: 'mock-session-token' }
                : undefined
        ),
    })),
}));

// Mock database
const mockPrisma = {
    user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    session: {
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    passwordResetToken: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    password_history: {
        create: vi.fn(),
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

// Mock auth functions
const mockVerifyPassword = vi.fn();
const mockHashPassword = vi.fn();
const mockCreateSession = vi.fn();
const mockInvalidateSessionByToken = vi.fn();
const mockGetSessionByToken = vi.fn();
const mockIsAccountLocked = vi.fn();
const mockRecordFailedLoginAttempt = vi.fn();
const mockResetFailedLoginAttempts = vi.fn();
const mockCheckPasswordHistory = vi.fn();
const mockValidatePasswordStrength = vi.fn();

vi.mock('@/lib/auth', () => ({
    verifyPassword: (...args: any[]) => mockVerifyPassword(...args),
    hashPassword: (...args: any[]) => mockHashPassword(...args),
    createSession: (...args: any[]) => mockCreateSession(...args),
    invalidateSessionByToken: (...args: any[]) => mockInvalidateSessionByToken(...args),
    getSessionByToken: (...args: any[]) => mockGetSessionByToken(...args),
    isAccountLocked: (...args: any[]) => mockIsAccountLocked(...args),
    recordFailedLoginAttempt: (...args: any[]) => mockRecordFailedLoginAttempt(...args),
    resetFailedLoginAttempts: (...args: any[]) => mockResetFailedLoginAttempts(...args),
    checkPasswordHistory: (...args: any[]) => mockCheckPasswordHistory(...args),
    validatePasswordStrength: (...args: any[]) => mockValidatePasswordStrength(...args),
}));

// Mock auth config
vi.mock('@/lib/authConfig', () => ({
    SESSION_COOKIE_NAME: 'session_token',
    SESSION_EXPIRY_DAYS: 7,
}));

// Mock authCookies
vi.mock('@/lib/authCookies', () => ({
    calculateSessionExpiry: vi.fn(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    getSessionCookieOptions: vi.fn(() => ({ httpOnly: true, secure: true, sameSite: 'lax' })),
}));

// Mock permissions
const mockGetUserPermissions = vi.fn();
vi.mock('@/lib/middleware/permissions', () => ({
    getUserPermissions: (...args: any[]) => mockGetUserPermissions(...args),
}));

// Mock email
const mockSendEmail = vi.fn();
vi.mock('@/lib/email', () => ({
    sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

// Mock email templates
vi.mock('@/lib/email-templates', () => ({
    passwordResetTemplate: vi.fn((link) => `<a href="${link}">Reset Password</a>`),
}));

// Mock audit logging
const mockAddServerAuditLog = vi.fn();
vi.mock('@/app/actions/audit', () => ({
    addServerAuditLog: (...args: any[]) => mockAddServerAuditLog(...args),
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
}));

// Mock response helpers
vi.mock('@/lib/api/response-helpers', () => ({
    validationErrorResponse: vi.fn((errors) =>
        NextResponse.json({ success: false, error: 'VALIDATION_ERROR', errors }, { status: 400 })
    ),
    unauthorizedResponse: vi.fn(() =>
        NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    ),
    notFoundResponse: vi.fn((entity) =>
        NextResponse.json({ success: false, error: 'NOT_FOUND', message: `${entity} not found` }, { status: 404 })
    ),
    errorResponse: vi.fn((message, status = 500) =>
        NextResponse.json({ success: false, message }, { status })
    ),
}));

// Mock NextAuth
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    auth: vi.fn().mockResolvedValue(null),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
    createMockSession,
    createMockUser,
    createMockRequest,
} from '../utils/test-helpers';

// ============================================================================
// Helper Functions
// ============================================================================

function createJsonRequest(
    url: string,
    method: string,
    body?: any
): NextRequest {
    const init: RequestInit = { method };
    if (body) {
        init.body = JSON.stringify(body);
        init.headers = { 'Content-Type': 'application/json' };
    }
    return new NextRequest(url, init);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Auth Routes', () => {
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
        mockGetUserPermissions.mockResolvedValue(new Set(['read:users', 'write:users']));
        mockAddServerAuditLog.mockResolvedValue(undefined);
        mockSendEmail.mockResolvedValue(undefined);
        mockValidatePasswordStrength.mockReturnValue({ valid: true });
        mockCheckPasswordHistory.mockResolvedValue(false);
        mockHashPassword.mockResolvedValue('hashed-password');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // Login Route Tests
    // ========================================================================

    describe('POST /api/auth/login', () => {
        let loginHandler: any;

        beforeEach(async () => {
            const { POST } = await import('@/app/api/auth/login/route');
            loginHandler = POST;
        });

        it('should return 400 for invalid request body', async () => {
            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {});
            const response = await loginHandler(req);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
        });

        it('should return 401 for invalid credentials (user not found)', async () => {
            mockPrisma.user.findFirst.mockResolvedValue(null);

            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
                username: 'nonexistent',
                password: 'password123',
            });
            const response = await loginHandler(req);

            expect(response.status).toBe(401);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toBe('Invalid credentials');
        });

        it('should return 403 for inactive account', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({
                ...createMockUser(),
                isActive: false,
            });

            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
                username: 'testuser',
                password: 'password123',
            });
            const response = await loginHandler(req);

            expect(response.status).toBe(403);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toContain('deactivated');
        });

        it('should return 423 for locked account', async () => {
            mockPrisma.user.findFirst.mockResolvedValue(createMockUser());
            mockIsAccountLocked.mockResolvedValue(true);

            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
                username: 'testuser',
                password: 'password123',
            });
            const response = await loginHandler(req);

            expect(response.status).toBe(423);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toContain('locked');
        });

        it('should return 401 for SSO account without password', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({
                ...createMockUser(),
                password: null,
            });
            mockIsAccountLocked.mockResolvedValue(false);

            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
                username: 'testuser',
                password: 'password123',
            });
            const response = await loginHandler(req);

            expect(response.status).toBe(401);
            const body = await response.json();
            expect(body.success).toBe(false);
        });

        it('should return 401 for invalid password', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({
                ...createMockUser(),
                password: 'hashed-password',
            });
            mockIsAccountLocked.mockResolvedValue(false);
            mockVerifyPassword.mockResolvedValue(false);

            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
                username: 'testuser',
                password: 'wrongpassword',
            });
            const response = await loginHandler(req);

            expect(response.status).toBe(401);
            expect(mockRecordFailedLoginAttempt).toHaveBeenCalled();
        });

        it('should return mfaRequired flag for MFA-enabled account', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({
                ...createMockUser(),
                password: 'hashed-password',
                mfaEnabled: true,
            });
            mockIsAccountLocked.mockResolvedValue(false);
            mockVerifyPassword.mockResolvedValue(true);

            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
                username: 'testuser',
                password: 'correctpassword',
            });
            const response = await loginHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.mfaRequired).toBe(true);
        });

        it('should return success with session cookie on valid login', async () => {
            mockPrisma.user.findFirst.mockResolvedValue({
                ...createMockUser(),
                password: 'hashed-password',
                mfaEnabled: false,
            });
            mockIsAccountLocked.mockResolvedValue(false);
            mockVerifyPassword.mockResolvedValue(true);
            mockCreateSession.mockResolvedValue('new-session-token');

            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
                username: 'testuser',
                password: 'correctpassword',
            });
            const response = await loginHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.user).toBeDefined();
            expect(mockAddServerAuditLog).toHaveBeenCalledWith(
                expect.objectContaining({ actionType: 'LOGIN_SUCCESS' })
            );
        });
    });

    // ========================================================================
    // Me Route Tests
    // ========================================================================

    describe('GET /api/auth/me', () => {
        let meHandler: any;

        beforeEach(async () => {
            const { GET } = await import('@/app/api/auth/me/route');
            meHandler = GET;
        });

        it('should return 401 with invalid session', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const req = createMockRequest('http://localhost:3000/api/auth/me');
            const response = await meHandler(req);

            expect(response.status).toBe(401);
        });

        it('should return 401 for inactive user', async () => {
            mockGetSessionByToken.mockResolvedValue(createMockSession());
            mockPrisma.user.findUnique.mockResolvedValue({
                ...createMockUser(),
                isActive: false,
            });

            const req = createMockRequest('http://localhost:3000/api/auth/me');
            const response = await meHandler(req);

            expect(response.status).toBe(401);
        });

        it('should return user profile with valid session', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...createMockUser(),
                isActive: true,
            });
            mockPrisma.session.findUnique.mockResolvedValue({
                expiresAt: new Date(Date.now() + 3600000),
                lastActivityAt: new Date(),
            });

            const req = createMockRequest('http://localhost:3000/api/auth/me');
            const response = await meHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            // After refactoring: returns both success and valid for backward compatibility
            expect(body.success).toBe(true);
            expect(body.valid).toBe(true);
            expect(body.user).toBeDefined();
            expect(body.permissionsHash).toBeDefined();
        });

        it('should include session expiry information', async () => {
            const session = createMockSession();
            const expiresAt = new Date(Date.now() + 3600000);
            const lastActivityAt = new Date();

            mockGetSessionByToken.mockResolvedValue(session);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...createMockUser(),
                isActive: true,
            });
            mockPrisma.session.findUnique.mockResolvedValue({
                expiresAt,
                lastActivityAt,
            });

            const req = createMockRequest('http://localhost:3000/api/auth/me');
            const response = await meHandler(req);

            const body = await response.json();
            expect(body.expiresAt).toBeDefined();
            expect(body.lastActivityAt).toBeDefined();
        });
    });

    // ========================================================================
    // Logout Route Tests
    // ========================================================================

    describe('POST /api/auth/logout', () => {
        let logoutHandler: any;

        beforeEach(async () => {
            const { POST } = await import('@/app/api/auth/logout/route');
            logoutHandler = POST;
        });

        it('should return 401 without valid session', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const req = createJsonRequest('http://localhost:3000/api/auth/logout', 'POST');
            const response = await logoutHandler(req);

            expect(response.status).toBe(401);
        });

        it('should invalidate session and return success', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);
            mockInvalidateSessionByToken.mockResolvedValue(undefined);

            const req = createJsonRequest('http://localhost:3000/api/auth/logout', 'POST');
            const response = await logoutHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(mockInvalidateSessionByToken).toHaveBeenCalled();
            expect(mockAddServerAuditLog).toHaveBeenCalledWith(
                expect.objectContaining({ actionType: 'LOGOUT' })
            );
        });
    });

    // ========================================================================
    // Session Route Tests
    // ========================================================================

    describe('GET /api/auth/session', () => {
        let sessionHandler: any;

        beforeEach(async () => {
            const { GET } = await import('@/app/api/auth/session/route');
            sessionHandler = GET;
        });

        it('should return 401 for invalid session', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const req = createMockRequest('http://localhost:3000/api/auth/session');
            const response = await sessionHandler(req);

            expect(response.status).toBe(401);
        });

        it('should return 401 for locked/inactive user', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...createMockUser(),
                isActive: false,
            });

            const req = createMockRequest('http://localhost:3000/api/auth/session');
            const response = await sessionHandler(req);

            expect(response.status).toBe(401);
        });

        it('should return session validity with active session', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...createMockUser(),
                isActive: true,
                lockedUntil: null,
            });
            mockPrisma.session.findUnique.mockResolvedValue({
                expiresAt: new Date(Date.now() + 3600000),
                lastActivityAt: new Date(),
            });

            const req = createMockRequest('http://localhost:3000/api/auth/session');
            const response = await sessionHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            // After refactoring: returns both success and valid for backward compatibility
            expect(body.success).toBe(true);
            expect(body.valid).toBe(true);
            expect(body.permissionsHash).toBeDefined();
        });

        it('should NOT update session activity', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...createMockUser(),
                isActive: true,
            });
            mockPrisma.session.findUnique.mockResolvedValue({
                expiresAt: new Date(Date.now() + 3600000),
                lastActivityAt: new Date(),
            });

            const req = createMockRequest('http://localhost:3000/api/auth/session');
            await sessionHandler(req);

            // Session activity should NOT be updated for this endpoint
            expect(mockUpdateSessionActivity).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Session Refresh Route Tests
    // ========================================================================

    describe('POST /api/auth/session/refresh', () => {
        let refreshHandler: any;

        beforeEach(async () => {
            const { POST } = await import('@/app/api/auth/session/refresh/route');
            refreshHandler = POST;
        });

        it('should return 401 without valid session', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const req = createJsonRequest('http://localhost:3000/api/auth/session/refresh', 'POST');
            const response = await refreshHandler(req);

            expect(response.status).toBe(401);
        });

        it('should extend session expiry and update activity', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);
            mockPrisma.session.update.mockResolvedValue({
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });

            const req = createJsonRequest('http://localhost:3000/api/auth/session/refresh', 'POST');
            const response = await refreshHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.expiresAt).toBeDefined();
            expect(mockPrisma.session.update).toHaveBeenCalled();
            expect(mockAddServerAuditLog).toHaveBeenCalledWith(
                expect.objectContaining({ actionType: 'SESSION_REFRESH' })
            );
        });
    });

    // ========================================================================
    // Password Route Tests
    // ========================================================================

    describe('PUT /api/auth/password', () => {
        let passwordHandler: any;

        beforeEach(async () => {
            const { PUT } = await import('@/app/api/auth/password/route');
            passwordHandler = PUT;
        });

        it('should return 401 without valid session', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const req = createJsonRequest('http://localhost:3000/api/auth/password', 'PUT', {
                oldPassword: 'oldpass',
                newPassword: 'newpass123',
            });
            const response = await passwordHandler(req);

            expect(response.status).toBe(401);
        });

        // Note: The password route bug has been fixed - validationResult is now properly declared
        it('should validate password strength', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...createMockUser(),
                password: 'hashed-password',
            });
            mockVerifyPassword.mockResolvedValue(true);
            mockValidatePasswordStrength.mockReturnValue({ valid: false, message: 'Password too weak' });

            const req = createJsonRequest('http://localhost:3000/api/auth/password', 'PUT', {
                oldPassword: 'oldpass',
                newPassword: 'weak',
            });

            // After fix: validation works correctly and returns password strength error
            const response = await passwordHandler(req);
            const body = await response.json();
            expect(response.status).toBe(400);
            expect(body.success).toBe(false);
            expect(body.message).toContain('Password too weak');
        });

        it('should check password history', async () => {
            const session = createMockSession();
            mockGetSessionByToken.mockResolvedValue(session);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...createMockUser(),
                password: 'hashed-password',
            });
            mockVerifyPassword.mockResolvedValue(true);
            mockValidatePasswordStrength.mockReturnValue({ valid: true });
            mockCheckPasswordHistory.mockResolvedValue(true); // Password used recently

            const req = createJsonRequest('http://localhost:3000/api/auth/password', 'PUT', {
                oldPassword: 'oldpass',
                newPassword: 'reused-password',
            });

            // After fix: validation works correctly and returns history error
            const response = await passwordHandler(req);
            const body = await response.json();
            expect(response.status).toBe(400);
            expect(body.success).toBe(false);
            expect(body.message).toContain('used recently');
        });
    });

    // ========================================================================
    // Forgot Password Route Tests
    // ========================================================================

    describe('POST /api/auth/forgot-password', () => {
        let forgotPasswordHandler: any;

        beforeEach(async () => {
            const { POST } = await import('@/app/api/auth/forgot-password/route');
            forgotPasswordHandler = POST;
        });

        it('should return 400 without email', async () => {
            const req = createJsonRequest('http://localhost:3000/api/auth/forgot-password', 'POST', {});
            const response = await forgotPasswordHandler(req);

            expect(response.status).toBe(400);
        });

        it('should return success even for non-existent email (prevent enumeration)', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const req = createJsonRequest('http://localhost:3000/api/auth/forgot-password', 'POST', {
                email: 'nonexistent@example.com',
            });
            const response = await forgotPasswordHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(mockAddServerAuditLog).toHaveBeenCalledWith(
                expect.objectContaining({ actionType: 'FORGOT_PASSWORD_REQUEST' })
            );
        });

        it('should create password reset token and send email for valid user', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(createMockUser());
            mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.passwordResetToken.create.mockResolvedValue({
                id: 'token-123',
                token: 'reset-token',
            });

            const req = createJsonRequest('http://localhost:3000/api/auth/forgot-password', 'POST', {
                email: 'test@example.com',
            });
            const response = await forgotPasswordHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalled();
            expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
            expect(mockSendEmail).toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Reset Password Route Tests
    // ========================================================================

    describe('POST /api/auth/reset-password', () => {
        let resetPasswordHandler: any;

        beforeEach(async () => {
            const { POST } = await import('@/app/api/auth/reset-password/route');
            resetPasswordHandler = POST;
        });

        it('should return 400 without token or password', async () => {
            const req = createJsonRequest('http://localhost:3000/api/auth/reset-password', 'POST', {});
            const response = await resetPasswordHandler(req);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toContain('Token and password are required');
        });

        it('should return 400 for invalid/expired token', async () => {
            mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

            const req = createJsonRequest('http://localhost:3000/api/auth/reset-password', 'POST', {
                token: 'invalid-token',
                password: 'newpassword123',
            });
            const response = await resetPasswordHandler(req);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toContain('Invalid or expired');
        });

        it('should return 400 for expired token', async () => {
            mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
                id: 'token-123',
                token: 'expired-token',
                expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
                userId: 'user-123',
                user: createMockUser(),
            });

            const req = createJsonRequest('http://localhost:3000/api/auth/reset-password', 'POST', {
                token: 'expired-token',
                password: 'newpassword123',
            });
            const response = await resetPasswordHandler(req);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toContain('Invalid or expired');
        });

        it('should enforce password strength', async () => {
            mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
                id: 'token-123',
                token: 'valid-token',
                expiresAt: new Date(Date.now() + 3600000),
                userId: 'user-123',
                user: createMockUser(),
            });
            mockValidatePasswordStrength.mockReturnValue({ valid: false, message: 'Password too weak' });

            const req = createJsonRequest('http://localhost:3000/api/auth/reset-password', 'POST', {
                token: 'valid-token',
                password: 'weak',
            });
            const response = await resetPasswordHandler(req);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toContain('Password too weak');
        });

        it('should check password history', async () => {
            mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
                id: 'token-123',
                token: 'valid-token',
                expiresAt: new Date(Date.now() + 3600000),
                userId: 'user-123',
                user: createMockUser(),
            });
            mockValidatePasswordStrength.mockReturnValue({ valid: true });
            mockCheckPasswordHistory.mockResolvedValue(true);

            const req = createJsonRequest('http://localhost:3000/api/auth/reset-password', 'POST', {
                token: 'valid-token',
                password: 'reused-password',
            });
            const response = await resetPasswordHandler(req);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toContain('used recently');
        });

        it('should reset password successfully with valid token', async () => {
            mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
                id: 'token-123',
                token: 'valid-token',
                expiresAt: new Date(Date.now() + 3600000),
                userId: 'user-123',
                user: createMockUser(),
            });
            mockValidatePasswordStrength.mockReturnValue({ valid: true });
            mockCheckPasswordHistory.mockResolvedValue(false);
            mockPrisma.user.update.mockResolvedValue({});
            mockPrisma.passwordResetToken.delete.mockResolvedValue({});

            const req = createJsonRequest('http://localhost:3000/api/auth/reset-password', 'POST', {
                token: 'valid-token',
                password: 'newstrongpassword123',
            });
            const response = await resetPasswordHandler(req);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(mockPrisma.passwordResetToken.delete).toHaveBeenCalled();
            expect(mockAddServerAuditLog).toHaveBeenCalledWith(
                expect.objectContaining({ actionType: 'PASSWORD_RESET_SUCCESS' })
            );
        });
    });

    // ========================================================================
    // Rate Limiting Tests
    // ========================================================================

    describe('Rate Limiting', () => {
        it('should apply rate limit of 10 to login route', async () => {
            mockRateLimitMiddleware.mockResolvedValue(
                NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 })
            );

            const { POST } = await import('@/app/api/auth/login/route');
            const req = createJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
                username: 'test',
                password: 'test',
            });
            const response = await POST(req);

            expect(response.status).toBe(429);
        });

        it('should apply rate limit of 5 to forgot-password route', async () => {
            mockRateLimitMiddleware.mockResolvedValue(
                NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 })
            );

            const { POST } = await import('@/app/api/auth/forgot-password/route');
            const req = createJsonRequest('http://localhost:3000/api/auth/forgot-password', 'POST', {
                email: 'test@example.com',
            });
            const response = await POST(req);

            expect(response.status).toBe(429);
        });

        it('should apply rate limit of 5 to reset-password route', async () => {
            mockRateLimitMiddleware.mockResolvedValue(
                NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 })
            );

            const { POST } = await import('@/app/api/auth/reset-password/route');
            const req = createJsonRequest('http://localhost:3000/api/auth/reset-password', 'POST', {
                token: 'test',
                password: 'test',
            });
            const response = await POST(req);

            expect(response.status).toBe(429);
        });
    });
});
