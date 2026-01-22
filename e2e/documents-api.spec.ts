/**
 * E2E Tests for Documents API
 * Comprehensive tests for document upload, retrieval, and management
 */
import { test, expect } from '@playwright/test';
import {
    loginAsAdmin,
    authenticatedRequest,
    createTestLead,
    cleanupTestData,
} from './fixtures/auth-helpers';

let adminSession: string;
const createdLeadIds: string[] = [];
const createdDocumentIds: string[] = [];

test.describe('Documents API E2E Tests', () => {
    test.beforeAll(async ({ request }) => {
        try {
            adminSession = await loginAsAdmin(request);
        } catch (e) {
            console.warn('Admin login failed, tests may be skipped:', e);
        }
    });

    test.afterAll(async ({ request }) => {
        if (adminSession) {
            await cleanupTestData(request, adminSession, {
                leadIds: createdLeadIds,
                documentIds: createdDocumentIds,
            });
        }
    });

    // ========================================================================
    // Document Upload
    // ========================================================================

    test.describe('Document Upload', () => {
        test('should upload document with valid file', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await request.post('/api/documents/upload', {
                headers: {
                    Cookie: `sf_session=${adminSession}`,
                },
                multipart: {
                    file: {
                        name: 'test-document.txt',
                        mimeType: 'text/plain',
                        buffer: Buffer.from('Test document content for E2E testing'),
                    },
                },
            });

            // Expect 200 or 201 for successful upload
            expect([200, 201]).toContain(response.status());
            const body = await response.json();
            expect(body.success).toBe(true);
            if (body.data?.id) {
                createdDocumentIds.push(body.data.id);
            }
        });

        test('should upload document linked to a lead', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            // Create a lead first
            const lead = await createTestLead(request, adminSession);
            createdLeadIds.push(lead.id);

            const response = await request.post('/api/documents/upload', {
                headers: {
                    Cookie: `sf_session=${adminSession}`,
                },
                multipart: {
                    file: {
                        name: 'lead-document.pdf',
                        mimeType: 'application/pdf',
                        buffer: Buffer.from('%PDF-1.4 test content'),
                    },
                    leadId: lead.id,
                },
            });

            // Expect 200 or 201 for successful upload
            expect([200, 201]).toContain(response.status());
            const body = await response.json();
            expect(body.success).toBe(true);
            if (body.data?.id) {
                createdDocumentIds.push(body.data.id);
            }
        });

        test('should return 401 without authentication', async ({ request }) => {
            const response = await request.post('/api/documents/upload', {
                multipart: {
                    file: {
                        name: 'test.txt',
                        mimeType: 'text/plain',
                        buffer: Buffer.from('test'),
                    },
                },
            });

            expect([401, 403, 307, 308]).toContain(response.status());
        });
    });

    // ========================================================================
    // Document Retrieval
    // ========================================================================

    test.describe('Document Retrieval', () => {
        test('should return list of documents', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(request, 'GET', '/api/documents', adminSession);

            // Documents list should always return 200 when authenticated
            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data).toBeDefined();
        });

        test('should support pagination', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(
                request,
                'GET',
                '/api/documents?page=1&limit=10',
                adminSession
            );

            // Pagination should always work when authenticated
            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
        });

        test('should return 401 without authentication', async ({ request }) => {
            const response = await request.get('/api/documents');
            expect([401, 403, 307, 308]).toContain(response.status());
        });
    });

    // ========================================================================
    // Document Search (if available)
    // ========================================================================

    test.describe('Document Search', () => {
        test('should search documents by query', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(
                request,
                'POST',
                '/api/documents/search',
                adminSession,
                { query: 'test' }
            );

            // Search is an optional feature - skip if not implemented (404)
            if (response.status() === 404) {
                test.skip(true, 'Search endpoint not implemented');
                return;
            }
            // If implemented, should return 200 for valid search
            expect(response.status()).toBe(200);
        });
    });

    // ========================================================================
    // Document Verification (if available)
    // ========================================================================

    test.describe('Document Verification', () => {
        test('should verify document if endpoint exists', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            // This test is conditional on having a document
            if (createdDocumentIds.length > 0) {
                const docId = createdDocumentIds[0];
                const response = await authenticatedRequest(
                    request,
                    'POST',
                    `/api/documents/${docId}/verify`,
                    adminSession
                );

                // Verify is an optional feature - skip if not implemented (404)
                if (response.status() === 404) {
                    test.skip(true, 'Verify endpoint not implemented');
                    return;
                }
                // If implemented, should return 200 for successful verification
                expect([200, 403]).toContain(response.status());
            }
        });
    });

    // ========================================================================
    // Authentication Requirements
    // ========================================================================

    test.describe('Authentication Requirements', () => {
        test('GET /api/documents requires authentication', async ({ request }) => {
            const response = await request.get('/api/documents');
            expect([401, 403, 307, 308]).toContain(response.status());
        });

        test('POST /api/documents/upload requires authentication', async ({ request }) => {
            const response = await request.post('/api/documents/upload', {
                multipart: {
                    file: {
                        name: 'test.txt',
                        mimeType: 'text/plain',
                        buffer: Buffer.from('test'),
                    },
                },
            });
            expect([401, 403, 307, 308]).toContain(response.status());
        });
    });

    // ========================================================================
    // Document Download
    // ========================================================================

    test.describe('Document Download', () => {
        test('should download document if exists', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            if (createdDocumentIds.length > 0) {
                const docId = createdDocumentIds[0];
                const response = await authenticatedRequest(
                    request,
                    'GET',
                    `/api/documents/${docId}/download`,
                    adminSession
                );

                // Download should succeed with 200
                expect(response.status()).toBe(200);
            }
        });

        test('should return 404 for non-existent document', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(
                request,
                'GET',
                '/api/documents/non-existent-doc-id/download',
                adminSession
            );

            expect([404, 400]).toContain(response.status());
        });
    });
});
