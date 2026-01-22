/**
 * E2E Auth Helpers
 * Provides reusable authentication utilities for E2E tests
 */
import { APIRequestContext, Page, expect } from '@playwright/test';
import { TEST_DATA } from './test-data';

// Test user credentials - sourced from shared test data or environment variables
const TEST_ADMIN = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@crm.local',
    password: process.env.TEST_ADMIN_PASSWORD || TEST_DATA.passwords.default,
};

const TEST_USER = {
    email: process.env.TEST_USER_EMAIL || 'sales@crm.local',
    password: process.env.TEST_USER_PASSWORD || TEST_DATA.passwords.default,
};

/**
 * Login as admin and return session cookie
 */
export async function loginAsAdmin(request: APIRequestContext): Promise<string> {
    const response = await request.post('/api/auth/login', {
        data: {
            email: TEST_ADMIN.email,
            password: TEST_ADMIN.password,
        },
    });

    if (!response.ok()) {
        throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
    }

    return extractSessionCookie(response);
}

/**
 * Login as regular user and return session cookie
 */
export async function loginAsUser(request: APIRequestContext): Promise<string> {
    const response = await request.post('/api/auth/login', {
        data: {
            email: TEST_USER.email,
            password: TEST_USER.password,
        },
    });

    if (!response.ok()) {
        throw new Error(`Login failed: ${response.status()} ${await response.text()}`);
    }

    return extractSessionCookie(response);
}

/**
 * Login with custom credentials
 */
export async function loginWithCredentials(
    request: APIRequestContext,
    email: string,
    password: string
): Promise<string> {
    const response = await request.post('/api/auth/login', {
        data: { email, password },
    });

    if (!response.ok()) {
        throw new Error(`Login failed: ${response.status()}`);
    }

    return extractSessionCookie(response);
}

/**
 * Logout and clear session
 */
export async function logout(request: APIRequestContext, sessionCookie: string): Promise<void> {
    await request.post('/api/auth/logout', {
        headers: {
            Cookie: `sf_session=${sessionCookie}`,
        },
    });
}

/**
 * Extract session cookie from response
 */
export function extractSessionCookie(response: any): string {
    const cookies = response.headers()['set-cookie'];
    if (!cookies) {
        throw new Error('No cookies in response');
    }

    const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
    const sessionCookie = cookieArray.find((c: string) => c.includes('sf_session='));

    if (!sessionCookie) {
        throw new Error('Session cookie not found');
    }

    const match = sessionCookie.match(/sf_session=([^;]+)/);
    if (!match) {
        throw new Error('Could not parse session cookie');
    }

    return match[1];
}

/**
 * Get session cookie from page context
 */
export async function getSessionCookieFromPage(page: Page): Promise<string | null> {
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'sf_session');
    return sessionCookie?.value ?? null;
}

/**
 * Make authenticated API request
 */
export async function authenticatedRequest(
    request: APIRequestContext,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    sessionCookie: string,
    data?: any
) {
    const options: any = {
        headers: {
            Cookie: `sf_session=${sessionCookie}`,
        },
    };

    if (data) {
        options.data = data;
    }

    switch (method) {
        case 'GET':
            return request.get(url, options);
        case 'POST':
            return request.post(url, options);
        case 'PUT':
            return request.put(url, options);
        case 'PATCH':
            return request.patch(url, options);
        case 'DELETE':
            return request.delete(url, options);
    }
}

/**
 * Create a test lead via API
 */
export async function createTestLead(
    request: APIRequestContext,
    sessionCookie: string,
    overrides: Partial<{
        clientName: string;
        company: string;
        mobileNumber: string;
        email: string;
        status: string;
    }> = {}
): Promise<any> {
    const leadData = {
        clientName: overrides.clientName ?? `Test Client ${Date.now()}`,
        company: overrides.company ?? 'Test Company',
        mobileNumber: overrides.mobileNumber ?? `555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
        email: overrides.email ?? `test${Date.now()}@example.com`,
        status: overrides.status ?? 'NEW',
    };

    const response = await authenticatedRequest(request, 'POST', '/api/leads', sessionCookie, leadData);

    if (!response.ok()) {
        const text = await response.text();
        throw new Error(`Failed to create lead: ${response.status()} ${text}`);
    }

    const body = await response.json();
    return body.data;
}

/**
 * Delete a test lead via API
 */
export async function deleteTestLead(
    request: APIRequestContext,
    sessionCookie: string,
    leadId: string
): Promise<void> {
    const response = await authenticatedRequest(request, 'DELETE', `/api/leads/${leadId}`, sessionCookie);
    // Ignore 404 errors (lead may have already been deleted)
    if (!response.ok() && response.status() !== 404) {
        throw new Error(`Failed to delete lead: ${response.status()}`);
    }
}

/**
 * Create a test document upload via API
 */
export async function createTestDocument(
    request: APIRequestContext,
    sessionCookie: string,
    options: {
        fileName?: string;
        fileType?: string;
        content?: string;
        leadId?: string;
    } = {}
): Promise<any> {
    const fileName = options.fileName ?? 'test-document.txt';
    const content = options.content ?? 'Test document content';

    // Create form data for file upload
    const formData = new FormData();
    const blob = new Blob([content], { type: options.fileType ?? 'text/plain' });
    formData.append('file', blob, fileName);

    if (options.leadId) {
        formData.append('leadId', options.leadId);
    }

    const response = await request.post('/api/documents/upload', {
        headers: {
            Cookie: `sf_session=${sessionCookie}`,
        },
        multipart: {
            file: {
                name: fileName,
                mimeType: options.fileType ?? 'text/plain',
                buffer: Buffer.from(content),
            },
            ...(options.leadId && { leadId: options.leadId }),
        },
    });

    if (!response.ok()) {
        const text = await response.text();
        throw new Error(`Failed to upload document: ${response.status()} ${text}`);
    }

    const body = await response.json();
    return body.data;
}

/**
 * Cleanup test data after tests
 */
export async function cleanupTestData(
    request: APIRequestContext,
    sessionCookie: string,
    options: {
        leadIds?: string[];
        documentIds?: string[];
    }
): Promise<void> {
    // Delete leads
    if (options.leadIds) {
        for (const leadId of options.leadIds) {
            try {
                await deleteTestLead(request, sessionCookie, leadId);
            } catch (e) {
                console.warn(`Failed to cleanup lead ${leadId}:`, e);
            }
        }
    }

    // Delete documents
    if (options.documentIds) {
        for (const docId of options.documentIds) {
            try {
                await authenticatedRequest(request, 'DELETE', `/api/documents/${docId}`, sessionCookie);
            } catch (e) {
                console.warn(`Failed to cleanup document ${docId}:`, e);
            }
        }
    }
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
    condition: () => Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Assert API response is successful
 */
export async function expectApiSuccess(response: any, expectedStatus: number = 200) {
    expect(response.status()).toBe(expectedStatus);
    const body = await response.json();
    expect(body.success).toBe(true);
    return body;
}

/**
 * Assert API response is an error
 */
export async function expectApiError(response: any, expectedStatus: number, expectedCode?: string) {
    expect(response.status()).toBe(expectedStatus);
    const body = await response.json();
    expect(body.success).toBe(false);
    if (expectedCode) {
        expect(body.error).toBe(expectedCode);
    }
    return body;
}
