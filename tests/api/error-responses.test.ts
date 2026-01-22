/**
 * Integration Tests for Standardized Error Responses
 * Tests error handling consistency across the withApiHandler wrapper
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
        get: vi.fn(() => ({ value: 'mock-session-token' })),
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

const mockGetSessionByToken = vi.fn();
vi.mock('@/lib/auth', () => ({
    getSessionByToken: (...args: any[]) => mockGetSessionByToken(...args),
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

vi.mock('@/lib/middleware/api-key-auth', () => ({
    apiKeyAuthMiddleware: vi.fn(),
}));

vi.mock('@/lib/api-keys', () => ({
    logApiUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    auth: vi.fn().mockResolvedValue(null),
}));

// ============================================================================
// Imports
// ============================================================================

import { withApiHandler, ValidationError, AuthError, ConflictError, ServerError } from '@/lib/api/withApiHandler';
import { handleApiError } from '@/lib/middleware/error-handler';
import { OptimisticLockError } from '@/lib/utils/optimistic-locking';
import { createMockSession, createMockRequest } from '../utils/test-helpers';

// ============================================================================
// Test Suite
// ============================================================================

describe('Standardized Error Responses', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsDatabaseHealthy.mockResolvedValue(true);
        mockGetSessionByToken.mockResolvedValue(createMockSession());
    });

    // ========================================================================
    // Validation Errors (400)
    // ========================================================================

    describe('Validation Errors', () => {
        it('should return 400 for Zod validation errors', async () => {
            const schema = z.object({
                email: z.string().email(),
                name: z.string().min(2),
            });

            const handler = vi.fn().mockImplementation(async () => {
                const result = schema.safeParse({ email: 'invalid', name: '' });
                if (!result.success) {
                    throw result.error;
                }
                return NextResponse.json({ success: true });
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('VALIDATION_ERROR');
            expect(body.message).toBe('Validation failed');
            expect(Array.isArray(body.errors)).toBe(true);
        });

        it('should return 400 for custom ValidationError', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw new ValidationError('Validation failed', [
                    { field: 'email', message: 'Invalid email', code: 'INVALID_FORMAT' }
                ]);
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('VALIDATION_ERROR');
        });

        it('should format Zod errors with field, message, and code', async () => {
            const schema = z.object({
                email: z.string().email('Invalid email format'),
            });

            const handler = vi.fn().mockImplementation(async () => {
                const result = schema.safeParse({ email: 'not-an-email' });
                if (!result.success) {
                    throw result.error;
                }
                return NextResponse.json({ success: true });
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            const body = await response.json();
            expect(body.errors).toHaveLength(1);
            expect(body.errors[0]).toHaveProperty('field');
            expect(body.errors[0]).toHaveProperty('message');
            expect(body.errors[0]).toHaveProperty('code');
        });
    });

    // ========================================================================
    // Authentication Errors (401)
    // ========================================================================

    describe('Authentication Errors', () => {
        it('should return 401 for AuthError', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw new AuthError('Invalid credentials');
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toBe('Invalid credentials');
        });

        it('should return 401 for missing session', async () => {
            mockGetSessionByToken.mockResolvedValue(null);

            const handler = vi.fn();
            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(401);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('UNAUTHORIZED');
        });
    });

    // ========================================================================
    // Prisma Database Errors (404, 409)
    // ========================================================================

    describe('Prisma Database Errors', () => {
        it('should return 409 for Prisma P2002 unique constraint violation', async () => {
            // Import Prisma namespace for creating error
            const { Prisma } = await import('@prisma/client');

            const handler = vi.fn().mockImplementation(async () => {
                const error = new Prisma.PrismaClientKnownRequestError(
                    'Unique constraint failed on the constraint: `User_email_key`',
                    {
                        code: 'P2002',
                        meta: { target: ['email'] },
                        clientVersion: '5.0.0',
                    }
                );
                throw error;
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(409);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toContain('email');
        });

        it('should return 404 for Prisma P2025 record not found', async () => {
            const { Prisma } = await import('@prisma/client');

            const handler = vi.fn().mockImplementation(async () => {
                const error = new Prisma.PrismaClientKnownRequestError(
                    'An operation failed because it depends on one or more records that were required but not found.',
                    {
                        code: 'P2025',
                        meta: { cause: 'Record to update not found.' },
                        clientVersion: '5.0.0',
                    }
                );
                throw error;
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(404);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.message).toBe('Record not found');
        });

        it('should include target field in P2002 duplicate error message', async () => {
            const { Prisma } = await import('@prisma/client');

            const handler = vi.fn().mockImplementation(async () => {
                const error = new Prisma.PrismaClientKnownRequestError(
                    'Unique constraint failed',
                    {
                        code: 'P2002',
                        meta: { target: ['mobileNumber', 'tenantId'] },
                        clientVersion: '5.0.0',
                    }
                );
                throw error;
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(409);
            const body = await response.json();
            expect(body.message).toContain('mobileNumber');
            expect(body.message).toContain('tenantId');
        });
    });

    // ========================================================================
    // Conflict Errors (409)
    // ========================================================================

    describe('Conflict Errors', () => {
        it('should return 409 for ConflictError', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw new ConflictError('Resource conflict', { field: 'email', existingId: '123' });
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(409);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('CONFLICT');
        });

        it('should return 409 for OptimisticLockError with version details', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw new OptimisticLockError('Lead', 'lead-123', 1, 2);
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(409);
            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('CONFLICT');
            expect(body.code).toBe('OPTIMISTIC_LOCK_FAILED');
            expect(body.details).toBeDefined();
            expect(body.details.entityType).toBe('Lead');
            expect(body.details.expectedVersion).toBe(1);
            expect(body.details.actualVersion).toBe(2);
        });
    });

    // ========================================================================
    // Server Errors (500)
    // ========================================================================

    describe('Server Errors', () => {
        it('should return 500 for generic Error', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw new Error('Something went wrong');
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(500);
            const body = await response.json();
            expect(body.success).toBe(false);
        });

        it('should return 500 for ServerError', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw new ServerError('Internal server error');
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(500);
        });

        it('should return 500 for unhandled exceptions', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw 'Unexpected string error';
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            expect(response.status).toBe(500);
        });
    });

    // ========================================================================
    // Response Format Consistency
    // ========================================================================

    describe('Response Format Consistency', () => {
        it('all error responses should have success: false', async () => {
            const errorCases = [
                async () => { throw new ValidationError('Test'); },
                async () => { throw new AuthError('Test'); },
                async () => { throw new ConflictError('Test'); },
                async () => { throw new Error('Test'); },
            ];

            for (const errorFn of errorCases) {
                const handler = vi.fn().mockImplementation(errorFn);
                const wrappedHandler = withApiHandler({}, handler);
                const req = createMockRequest();
                const response = await wrappedHandler(req);

                const body = await response.json();
                expect(body.success).toBe(false);
            }
        });

        it('error responses should have message field', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw new ConflictError('Conflict occurred');
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            const body = await response.json();
            expect(body.message).toBeDefined();
            expect(typeof body.message).toBe('string');
        });

        it('validation errors should include errors array', async () => {
            const handler = vi.fn().mockImplementation(async () => {
                throw new ValidationError('Validation failed', [
                    { field: 'name', message: 'Required', code: 'REQUIRED' }
                ]);
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            const response = await wrappedHandler(req);

            const body = await response.json();
            expect(body.errors).toBeDefined();
            expect(Array.isArray(body.errors)).toBe(true);
        });
    });

    // ========================================================================
    // Error Logging
    // ========================================================================

    describe('Error Logging', () => {
        it('should log errors to console', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            const handler = vi.fn().mockImplementation(async () => {
                throw new Error('Test error');
            });

            const wrappedHandler = withApiHandler({}, handler);
            const req = createMockRequest();
            await wrappedHandler(req);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});
