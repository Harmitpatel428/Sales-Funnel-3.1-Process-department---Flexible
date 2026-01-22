/**
 * Unit Tests for Response Helpers
 * Tests all response helper functions for correct structure and behavior
 */
import { describe, it, expect } from 'vitest';
import {
    successResponse,
    errorResponse,
    notFoundResponse,
    unauthorizedResponse,
    forbiddenResponse,
    serviceUnavailableResponse,
    rateLimitResponse,
    validationErrorResponse,
} from '@/lib/api/response-helpers';

describe('Response Helpers', () => {
    // ========================================================================
    // Success Responses
    // ========================================================================

    describe('successResponse', () => {
        it('should return 200 status with data', async () => {
            const data = { id: 'test-123', name: 'Test' };
            const response = successResponse(data);

            expect(response.status).toBe(200);

            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data).toEqual(data);
        });

        it('should include optional message', async () => {
            const data = { id: '123' };
            const response = successResponse(data, 'Operation completed successfully');

            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data).toEqual(data);
            expect(body.message).toBe('Operation completed successfully');
        });

        it('should work with array data', async () => {
            const data = [{ id: '1' }, { id: '2' }];
            const response = successResponse(data);

            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data).toEqual(data);
            expect(Array.isArray(body.data)).toBe(true);
        });

        it('should work with null data', async () => {
            const response = successResponse(null);

            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data).toBeNull();
        });
    });

    // ========================================================================
    // Error Responses
    // ========================================================================

    describe('errorResponse', () => {
        it('should return specified status code with error details', async () => {
            const response = errorResponse('Something went wrong', undefined, 500, 'INTERNAL_SERVER_ERROR');

            expect(response.status).toBe(500);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('INTERNAL_SERVER_ERROR');
            expect(body.message).toBe('Something went wrong');
        });

        it('should default to 500 status', async () => {
            const response = errorResponse('Error occurred');

            expect(response.status).toBe(500);
        });

        it('should include errors array when provided', async () => {
            const errors = ['Error 1', 'Error 2'];
            const response = errorResponse('Validation failed', errors, 400, 'VALIDATION_ERROR');

            const body = await response.json();
            expect(body.errors).toEqual(errors);
        });
    });

    describe('notFoundResponse', () => {
        it('should return 404 status', async () => {
            const response = notFoundResponse();

            expect(response.status).toBe(404);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('NOT_FOUND');
            expect(body.message).toBe('Resource not found');
        });

        it('should use custom entity name', async () => {
            const response = notFoundResponse('Lead');

            const body = await response.json();
            expect(body.message).toBe('Lead not found');
        });
    });

    describe('unauthorizedResponse', () => {
        it('should return 401 status', async () => {
            const response = unauthorizedResponse();

            expect(response.status).toBe(401);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('UNAUTHORIZED');
            expect(body.message).toBe('Unauthorized');
        });
    });

    describe('forbiddenResponse', () => {
        it('should return 403 status', async () => {
            const response = forbiddenResponse();

            expect(response.status).toBe(403);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('FORBIDDEN');
            expect(body.message).toBe('Forbidden');
        });
    });

    describe('serviceUnavailableResponse', () => {
        it('should return 503 status', async () => {
            const response = serviceUnavailableResponse();

            expect(response.status).toBe(503);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('SERVICE_UNAVAILABLE');
            expect(body.message).toBe('Service temporarily unavailable');
        });
    });

    // ========================================================================
    // Rate Limit Response
    // ========================================================================

    describe('rateLimitResponse', () => {
        it('should return 429 status', async () => {
            const response = rateLimitResponse(0, '60');

            expect(response.status).toBe(429);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
            expect(body.message).toBe('Too Many Requests');
        });

        it('should include rate limit headers', () => {
            const response = rateLimitResponse(5, '120');

            expect(response.headers.get('X-RateLimit-Remaining')).toBe('5');
            expect(response.headers.get('X-RateLimit-Reset')).toBe('120');
        });
    });

    // ========================================================================
    // Validation Error Response
    // ========================================================================

    describe('validationErrorResponse', () => {
        it('should return 400 status with formatted errors', async () => {
            const errors = [
                { field: 'email', message: 'Invalid email format', code: 'INVALID_FORMAT' },
                { field: 'name', message: 'Name is required', code: 'REQUIRED_FIELD' },
            ];

            const response = validationErrorResponse(errors);

            expect(response.status).toBe(400);

            const body = await response.json();
            expect(body.success).toBe(false);
            expect(body.error).toBe('VALIDATION_ERROR');
            expect(body.message).toBe('Validation failed');
            expect(body.errors).toEqual(errors);
        });

        it('should handle legacy string array errors', async () => {
            const errors = ['Email is invalid', 'Name is required'];

            const response = validationErrorResponse(errors);

            expect(response.status).toBe(400);

            const body = await response.json();
            expect(body.errors).toHaveLength(2);
            expect(body.errors[0]).toEqual({
                field: 'unknown',
                message: 'Email is invalid',
                code: 'VALIDATION_ERROR',
            });
            expect(body.errors[1]).toEqual({
                field: 'unknown',
                message: 'Name is required',
                code: 'VALIDATION_ERROR',
            });
        });

        it('should handle empty errors array', async () => {
            const response = validationErrorResponse([]);

            expect(response.status).toBe(400);

            const body = await response.json();
            expect(body.errors).toEqual([]);
        });
    });

    // ========================================================================
    // Response Content-Type
    // ========================================================================

    describe('Response Headers', () => {
        it('should set Content-Type to application/json', () => {
            const response = successResponse({ data: 'test' });
            expect(response.headers.get('Content-Type')).toBe('application/json');
        });

        it('should set Content-Type for error responses', () => {
            const response = errorResponse('Error');
            expect(response.headers.get('Content-Type')).toBe('application/json');
        });
    });

    // ========================================================================
    // Response Structure Consistency
    // ========================================================================

    describe('Response Structure Consistency', () => {
        it('all success responses should have success: true', async () => {
            const responses = [
                successResponse({ id: '1' }),
                successResponse(null),
                successResponse([]),
            ];

            for (const response of responses) {
                const body = await response.json();
                expect(body.success).toBe(true);
            }
        });

        it('all error responses should have success: false', async () => {
            const responses = [
                errorResponse('Error'),
                notFoundResponse(),
                unauthorizedResponse(),
                forbiddenResponse(),
                serviceUnavailableResponse(),
                rateLimitResponse(0, '60'),
                validationErrorResponse([]),
            ];

            for (const response of responses) {
                const body = await response.json();
                expect(body.success).toBe(false);
            }
        });

        it('all typed error responses should have error code field', async () => {
            const errorResponses = [
                { response: notFoundResponse(), expectedCode: 'NOT_FOUND' },
                { response: unauthorizedResponse(), expectedCode: 'UNAUTHORIZED' },
                { response: forbiddenResponse(), expectedCode: 'FORBIDDEN' },
                { response: serviceUnavailableResponse(), expectedCode: 'SERVICE_UNAVAILABLE' },
                { response: rateLimitResponse(0, '60'), expectedCode: 'RATE_LIMIT_EXCEEDED' },
                { response: validationErrorResponse([]), expectedCode: 'VALIDATION_ERROR' },
            ];

            for (const { response, expectedCode } of errorResponses) {
                const body = await response.json();
                expect(body.error).toBe(expectedCode);
            }
        });

        it('all error responses should have message field', async () => {
            const responses = [
                errorResponse('Test error'),
                notFoundResponse(),
                unauthorizedResponse(),
                forbiddenResponse(),
                serviceUnavailableResponse(),
                rateLimitResponse(0, '60'),
                validationErrorResponse([]),
            ];

            for (const response of responses) {
                const body = await response.json();
                expect(body.message).toBeDefined();
                expect(typeof body.message).toBe('string');
            }
        });
    });
});
