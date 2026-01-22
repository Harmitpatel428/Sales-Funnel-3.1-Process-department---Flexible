/**
 * Test Utilities and Mock Factories
 * Provides reusable utilities for API testing
 */
import { NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

// ============================================================================
// Mock Data Factories
// ============================================================================

/**
 * Create a mock session object
 */
export function createMockSession(overrides: Partial<{
    userId: string;
    role: string;
    sessionId: string;
    tenantId: string;
}> = {}) {
    return {
        userId: overrides.userId ?? 'user-123',
        role: overrides.role ?? 'ADMIN',
        sessionId: overrides.sessionId ?? 'session-123',
        tenantId: overrides.tenantId ?? 'tenant-123',
    };
}

/**
 * Create a mock user object
 */
export function createMockUser(overrides: Partial<{
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
    isActive: boolean;
    mfaEnabled: boolean;
}> = {}) {
    return {
        id: overrides.id ?? 'user-123',
        email: overrides.email ?? 'test@example.com',
        name: overrides.name ?? 'Test User',
        role: overrides.role ?? 'ADMIN',
        tenantId: overrides.tenantId ?? 'tenant-123',
        isActive: overrides.isActive ?? true,
        mfaEnabled: overrides.mfaEnabled ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Create a mock lead object
 */
export function createMockLead(overrides: Partial<{
    id: string;
    clientName: string;
    company: string;
    mobileNumber: string;
    email: string;
    status: string;
    tenantId: string;
    assignedTo: string | null;
    version: number;
}> = {}) {
    return {
        id: overrides.id ?? 'lead-123',
        clientName: overrides.clientName ?? 'Test Client',
        company: overrides.company ?? 'Test Company',
        mobileNumber: overrides.mobileNumber ?? '1234567890',
        email: overrides.email ?? 'client@example.com',
        status: overrides.status ?? 'NEW',
        tenantId: overrides.tenantId ?? 'tenant-123',
        assignedTo: overrides.assignedTo ?? null,
        version: overrides.version ?? 1,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Create a mock API key object
 */
export function createMockApiKey(overrides: Partial<{
    id: string;
    name: string;
    keyHash: string;
    tenantId: string;
    scopes: string[];
    rateLimit: number;
    expiresAt: Date | null;
    isActive: boolean;
}> = {}) {
    return {
        id: overrides.id ?? 'apikey-123',
        name: overrides.name ?? 'Test API Key',
        keyHash: overrides.keyHash ?? 'hashed-key-value',
        tenantId: overrides.tenantId ?? 'tenant-123',
        scopes: overrides.scopes ?? ['leads:read', 'leads:write'],
        rateLimit: overrides.rateLimit ?? 1000,
        expiresAt: overrides.expiresAt ?? null,
        isActive: overrides.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

/**
 * Create a mock NextRequest
 */
export function createMockRequest(
    url: string = 'http://localhost:3000/api/test',
    options: {
        method?: string;
        body?: any;
        headers?: Record<string, string>;
    } = {}
): NextRequest {
    const init: RequestInit = {
        method: options.method ?? 'GET',
    };

    if (options.body) {
        init.body = JSON.stringify(options.body);
        init.headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
    } else if (options.headers) {
        init.headers = options.headers;
    }

    return new NextRequest(url, init);
}

/**
 * Create a mock NextAuth session
 */
export function createMockNextAuthSession(overrides: Partial<{
    user: {
        id?: string;
        email?: string;
        name?: string;
        role?: string;
    };
    expires: string;
}> = {}) {
    return {
        user: {
            id: overrides.user?.id ?? 'user-123',
            email: overrides.user?.email ?? 'test@example.com',
            name: overrides.user?.name ?? 'Test User',
            role: overrides.user?.role ?? 'ADMIN',
        },
        expires: overrides.expires ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
}

// ============================================================================
// Mock Helpers for Dependencies
// ============================================================================

/**
 * Mock database as healthy
 */
export function mockDatabaseHealthy() {
    return vi.fn().mockResolvedValue(true);
}

/**
 * Mock database as unhealthy
 */
export function mockDatabaseUnhealthy() {
    return vi.fn().mockResolvedValue(false);
}

/**
 * Mock rate limit exceeded response
 */
export function mockRateLimitExceeded() {
    return vi.fn().mockResolvedValue(
        NextResponse.json(
            { success: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too Many Requests' },
            { status: 429 }
        )
    );
}

/**
 * Mock rate limit allowed (returns null)
 */
export function mockRateLimitAllowed() {
    return vi.fn().mockResolvedValue(null);
}

/**
 * Mock successful custom session authentication
 */
export function mockAuthSuccess(session = createMockSession()) {
    return vi.fn().mockResolvedValue(session);
}

/**
 * Mock failed authentication (returns null)
 */
export function mockAuthFailure() {
    return vi.fn().mockResolvedValue(null);
}

/**
 * Mock successful API key authentication
 */
export function mockApiKeyAuthSuccess(overrides: Partial<{
    apiKey: any;
    tenant: any;
    scopes: string[];
}> = {}) {
    return vi.fn().mockResolvedValue({
        apiKey: overrides.apiKey ?? createMockApiKey(),
        tenant: overrides.tenant ?? { id: 'tenant-123', name: 'Test Tenant' },
        scopes: overrides.scopes ?? ['leads:read', 'leads:write'],
    });
}

/**
 * Mock API key auth returning 401 response
 */
export function mockApiKeyAuthUnauthorized() {
    return vi.fn().mockResolvedValue(
        NextResponse.json(
            { success: false, error: { code: 'UNAUTHORIZED', message: 'API key required' } },
            { status: 401 }
        )
    );
}

/**
 * Mock API key auth returning 403 response (insufficient scopes)
 */
export function mockApiKeyAuthForbidden() {
    return vi.fn().mockResolvedValue(
        NextResponse.json(
            { success: false, error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Insufficient permissions' } },
            { status: 403 }
        )
    );
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert response is successful (status 2xx)
 */
export async function expectSuccessResponse(response: NextResponse, expectedData?: any) {
    const body = await response.json();

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(body.success).toBe(true);

    if (expectedData !== undefined) {
        expect(body.data).toEqual(expectedData);
    }

    return body;
}

/**
 * Assert response is an error with specific code
 */
export async function expectErrorResponse(
    response: NextResponse,
    expectedStatus: number,
    expectedCode?: string
) {
    const body = await response.json();

    expect(response.status).toBe(expectedStatus);
    expect(body.success).toBe(false);

    if (expectedCode) {
        expect(body.error).toBe(expectedCode);
    }

    return body;
}

/**
 * Assert response is 401 Unauthorized
 */
export async function expectUnauthorized(response: NextResponse) {
    return expectErrorResponse(response, 401, 'UNAUTHORIZED');
}

/**
 * Assert response is 403 Forbidden
 */
export async function expectForbidden(response: NextResponse) {
    return expectErrorResponse(response, 403, 'FORBIDDEN');
}

/**
 * Assert response is 404 Not Found
 */
export async function expectNotFound(response: NextResponse) {
    return expectErrorResponse(response, 404, 'NOT_FOUND');
}

/**
 * Assert response is 400 with validation errors
 */
export async function expectValidationError(response: NextResponse, expectedErrors?: string[]) {
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.errors).toBeDefined();
    expect(Array.isArray(body.errors)).toBe(true);

    if (expectedErrors) {
        const errorMessages = body.errors.map((e: any) => e.message);
        expectedErrors.forEach(expected => {
            expect(errorMessages).toContain(expected);
        });
    }

    return body;
}

/**
 * Assert response is 429 Rate Limited
 */
export async function expectRateLimited(response: NextResponse) {
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.success).toBe(false);

    return body;
}

/**
 * Assert response is 503 Service Unavailable
 */
export async function expectServiceUnavailable(response: NextResponse) {
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.error).toBe('SERVICE_UNAVAILABLE');

    return body;
}

/**
 * Assert response is 409 Conflict
 */
export async function expectConflict(response: NextResponse) {
    return expectErrorResponse(response, 409, 'CONFLICT');
}

// ============================================================================
// Test Setup Helpers
// ============================================================================

/**
 * Create common mock setup for withApiHandler tests
 */
export function createApiHandlerMocks() {
    return {
        isDatabaseHealthy: vi.fn().mockResolvedValue(true),
        rateLimitMiddleware: vi.fn().mockResolvedValue(null),
        getSessionByToken: vi.fn().mockResolvedValue(createMockSession()),
        logRequest: vi.fn(),
        updateSessionActivity: vi.fn().mockResolvedValue(undefined),
        handleApiError: vi.fn((error) => {
            console.error('API Error in Test:', error);
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }),
        apiKeyAuthMiddleware: vi.fn().mockResolvedValue({
            apiKey: createMockApiKey(),
            tenant: { id: 'tenant-123', name: 'Test Tenant' },
            scopes: ['leads:read', 'leads:write'],
        }),
        logApiUsage: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Mock cookies() from next/headers
 */
export function createMockCookies(sessionToken: string | null = 'mock-session-token') {
    return vi.fn(() => ({
        get: vi.fn((name: string) =>
            name === 'sf_session' && sessionToken
                ? { value: sessionToken }
                : undefined
        ),
    }));
}
