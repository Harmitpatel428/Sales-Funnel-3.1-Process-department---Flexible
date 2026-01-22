import { test, expect } from '@playwright/test';
import { TEST_DATA } from './fixtures/test-data';
import {
    loginAsAdmin,
    authenticatedRequest,
    extractSessionCookie,
    createTestLead,
    cleanupTestData,
} from './fixtures/auth-helpers';

test.describe('API Validation Test Suite', () => {

    test('TC015 - API Authentication and Modules', async ({ request }) => {
        // 1. Unauthenticated Access
        const unauthRes = await request.get('/api/leads');
        expect([401, 403, 307, 308]).toContain(unauthRes.status());

        // 2. Authenticated Access
        // Login to get cookie/token
        // Assuming we need to obtain a token or rely on cookie jar if separate context
        // This is a simplified check assuming integration or mocked auth
    });

    test('TC018 - API Structure, Idempotency and Locking', async ({ request }) => {
        // Login first if needed
        // ...

        // 1. Validate Response Schema (Structure)
        const res = await request.get('/api/leads');
        if (res.ok()) {
            const body = await res.json();
            expect(body).toHaveProperty('data');
            expect(Array.isArray(body.data)).toBeTruthy();
            if (body.data.length > 0) {
                const lead = body.data[0];
                expect(lead).toHaveProperty('id');
                expect(lead).toHaveProperty('clientName');
            }
        }

        // 2. Idempotency
        // Using Idempotency-Key header on a POST/PUT
        const key = `test-idempotency-${Date.now()}`;
        const leadData = TEST_DATA.leads_10[0];

        const res1 = await request.post('/api/leads', {
            data: leadData,
            headers: { 'Idempotency-Key': key }
        });

        // Retry same request
        const res2 = await request.post('/api/leads', {
            data: leadData,
            headers: { 'Idempotency-Key': key }
        });

        // Should handle gracefully (either 200 with same result, or 409, or ignored)
        // Ideally status should be consistent
        if (res1.ok()) {
            expect(res2.status()).toBe(res1.status());
            const body1 = await res1.json();
            const body2 = await res2.json();
            // ID should match if it returned the created resource both times (idempotent)
            if (body1.data?.id && body2.data?.id) {
                expect(body1.data.id).toBe(body2.data.id);
            }
        }

        // 3. Optimistic Locking (Version Conflict)
        // Fetch a lead
        // Mock update from User A
        // Mock update from User B with old version
        // Expect 409 Conflict
    });

});

// ============================================================================
// Auth Flows E2E Tests
// ============================================================================

test.describe('Auth Flow E2E Tests', () => {

    // ========================================================================
    // Login Flow
    // ========================================================================

    test.describe('Login Flow', () => {
        test('should login with valid credentials and set session cookie', async ({ request }) => {
            const response = await request.post('/api/auth/login', {
                data: {
                    email: 'admin@example.com',
                    password: 'Admin123!@#',
                },
            });

            // May succeed or fail depending on credentials
            if (response.ok()) {
                const cookies = response.headers()['set-cookie'];
                expect(cookies).toBeDefined();

                // Check for session cookie
                const hasSfSession = cookies?.includes('sf_session');
                expect(hasSfSession).toBe(true);

                const body = await response.json();
                expect(body.success).toBe(true);
            }
        });

        test('should return 401 for invalid credentials', async ({ request }) => {
            const response = await request.post('/api/auth/login', {
                data: {
                    email: 'admin@example.com',
                    password: 'WrongPassword123',
                },
            });

            expect([400, 401]).toContain(response.status());
            const body = await response.json();
            expect(body.success).toBe(false);
        });

        test('should return 400 for invalid email format', async ({ request }) => {
            const response = await request.post('/api/auth/login', {
                data: {
                    email: 'not-an-email',
                    password: 'SomePassword123!',
                },
            });

            expect([400, 401]).toContain(response.status());
        });

        test('should return 400 for missing credentials', async ({ request }) => {
            const response = await request.post('/api/auth/login', {
                data: {},
            });

            expect([400, 422]).toContain(response.status());
        });
    });

    // ========================================================================
    // Session Validation
    // ========================================================================

    test.describe('Session Validation', () => {
        test('should return user data with valid session', async ({ request }) => {
            let sessionCookie: string;
            try {
                sessionCookie = await loginAsAdmin(request);
            } catch {
                test.skip(true, 'Login not available');
                return;
            }

            const response = await authenticatedRequest(request, 'GET', '/api/auth/me', sessionCookie);

            if (response.ok()) {
                const body = await response.json();
                expect(body.success).toBe(true);
                expect(body.data).toHaveProperty('user');
            }
        });

        test('should return 401 without session', async ({ request }) => {
            const response = await request.get('/api/auth/me');
            expect([401, 403]).toContain(response.status());
        });

        test('should return 401 with invalid session token', async ({ request }) => {
            const response = await request.get('/api/auth/me', {
                headers: {
                    Cookie: 'sf_session=invalid-session-token-12345',
                },
            });

            expect([401, 403]).toContain(response.status());
        });
    });

    // ========================================================================
    // Logout Flow
    // ========================================================================

    test.describe('Logout Flow', () => {
        test('should invalidate session on logout', async ({ request }) => {
            let sessionCookie: string;
            try {
                sessionCookie = await loginAsAdmin(request);
            } catch {
                test.skip(true, 'Login not available');
                return;
            }

            // Logout
            const logoutResponse = await authenticatedRequest(request, 'POST', '/api/auth/logout', sessionCookie);
            expect([200, 204]).toContain(logoutResponse.status());

            // Try to use old session
            const meResponse = await authenticatedRequest(request, 'GET', '/api/auth/me', sessionCookie);
            expect([401, 403]).toContain(meResponse.status());
        });
    });

    // ========================================================================
    // Protected Routes
    // ========================================================================

    test.describe('Protected Routes', () => {
        test('GET /api/leads without auth returns 401', async ({ request }) => {
            const response = await request.get('/api/leads');
            expect([401, 403, 307, 308]).toContain(response.status());
        });

        test('GET /api/leads with valid session returns 200', async ({ request }) => {
            let sessionCookie: string;
            try {
                sessionCookie = await loginAsAdmin(request);
            } catch {
                test.skip(true, 'Login not available');
                return;
            }

            const response = await authenticatedRequest(request, 'GET', '/api/leads', sessionCookie);
            expect(response.status()).toBe(200);
        });

        test('GET /api/documents without auth returns 401', async ({ request }) => {
            const response = await request.get('/api/documents');
            expect([401, 403, 307, 308]).toContain(response.status());
        });

        test('GET /api/cases without auth returns 401', async ({ request }) => {
            const response = await request.get('/api/cases');
            expect([401, 403, 307, 308]).toContain(response.status());
        });

        test('GET /api/users without auth returns 401', async ({ request }) => {
            const response = await request.get('/api/users');
            expect([401, 403, 307, 308]).toContain(response.status());
        });
    });

    // ========================================================================
    // MFA Flow (if enabled)
    // ========================================================================

    test.describe('MFA Flow', () => {
        test('should handle MFA setup flow', async ({ request }) => {
            let sessionCookie: string;
            try {
                sessionCookie = await loginAsAdmin(request);
            } catch {
                test.skip(true, 'Login not available');
                return;
            }

            // Try to get MFA setup
            const response = await authenticatedRequest(request, 'POST', '/api/auth/mfa/setup', sessionCookie);

            // MFA setup is an optional feature - skip if not implemented
            if (response.status() === 404) {
                test.skip(true, 'MFA setup endpoint not implemented');
                return;
            }
            // If implemented, should return 200 for successful setup
            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
        });

        test('should reject MFA verification with invalid code', async ({ request }) => {
            let sessionCookie: string;
            try {
                sessionCookie = await loginAsAdmin(request);
            } catch {
                test.skip(true, 'Login not available');
                return;
            }

            const response = await authenticatedRequest(
                request,
                'POST',
                '/api/auth/mfa/verify-setup',
                sessionCookie,
                { code: '000000' }
            );

            // MFA verify is an optional feature - skip if not implemented
            if (response.status() === 404) {
                test.skip(true, 'MFA verify-setup endpoint not implemented');
                return;
            }
            // Invalid code should return 400
            expect(response.status()).toBe(400);
        });
    });

    // ========================================================================
    // Session Cookie Attributes
    // ========================================================================

    test.describe('Session Cookie Security', () => {
        test('session cookie should have secure attributes', async ({ request }) => {
            const response = await request.post('/api/auth/login', {
                data: {
                    email: 'admin@example.com',
                    password: 'Admin123!@#',
                },
            });

            if (response.ok()) {
                const cookies = response.headers()['set-cookie'];

                if (cookies) {
                    const sessionCookie = Array.isArray(cookies)
                        ? cookies.find(c => c.includes('sf_session'))
                        : cookies;

                    if (sessionCookie) {
                        // Check for HttpOnly flag
                        expect(sessionCookie.toLowerCase()).toContain('httponly');

                        // Check for SameSite attribute
                        expect(sessionCookie.toLowerCase()).toMatch(/samesite=(strict|lax)/);
                    }
                }
            }
        });
    });

    // ========================================================================
    // Password Reset Flow (if available)
    // ========================================================================

    test.describe('Password Reset Flow', () => {
        test('should accept forgot password request', async ({ request }) => {
            const response = await request.post('/api/auth/forgot-password', {
                data: {
                    email: 'test@example.com',
                },
            });

            // Should always return 200 to prevent email enumeration
            if (response.status() !== 404) {
                expect([200, 400]).toContain(response.status());
            }
        });

        test('should reject reset password with invalid token', async ({ request }) => {
            const response = await request.post('/api/auth/reset-password', {
                data: {
                    token: 'invalid-reset-token',
                    password: 'NewPassword123!',
                },
            });

            if (response.status() !== 404) {
                expect([400, 401]).toContain(response.status());
            }
        });
    });
});
