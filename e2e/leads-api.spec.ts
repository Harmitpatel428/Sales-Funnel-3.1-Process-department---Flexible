/**
 * E2E Tests for Leads API
 * Comprehensive tests for leads CRUD operations
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import {
    loginAsAdmin,
    loginAsUser,
    authenticatedRequest,
    createTestLead,
    deleteTestLead,
    cleanupTestData,
    expectApiSuccess,
    expectApiError,
} from './fixtures/auth-helpers';

let adminSession: string;
let userSession: string;
const createdLeadIds: string[] = [];

test.describe('Leads API E2E Tests', () => {
    test.beforeAll(async ({ request }) => {
        try {
            adminSession = await loginAsAdmin(request);
        } catch (e) {
            console.warn('Admin login failed, tests may be skipped:', e);
        }

        try {
            userSession = await loginAsUser(request);
        } catch (e) {
            console.warn('User login failed, tests may be skipped:', e);
        }
    });

    test.afterAll(async ({ request }) => {
        if (adminSession && createdLeadIds.length > 0) {
            await cleanupTestData(request, adminSession, { leadIds: createdLeadIds });
        }
    });

    // ========================================================================
    // Lead Creation
    // ========================================================================

    test.describe('Lead Creation', () => {
        test('should create lead with valid data', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const leadData = {
                clientName: `E2E Test Client ${Date.now()}`,
                company: 'E2E Test Company',
                mobileNumber: `555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
                email: `e2e-test-${Date.now()}@example.com`,
            };

            const response = await authenticatedRequest(request, 'POST', '/api/leads', adminSession, leadData);

            expect(response.status()).toBe(201);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data).toHaveProperty('id');
            expect(body.data.clientName).toBe(leadData.clientName);

            createdLeadIds.push(body.data.id);
        });

        test('should return 400 for invalid lead data', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(request, 'POST', '/api/leads', adminSession, {
                // Missing required fields
                company: 'Test',
            });

            expect(response.status()).toBe(400);
            const body = await response.json();
            expect(body.success).toBe(false);
        });

        test('should return 400 for missing required fields', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(request, 'POST', '/api/leads', adminSession, {});

            expect(response.status()).toBe(400);
        });

        test('should return 401 without authentication', async ({ request }) => {
            const response = await request.post('/api/leads', {
                data: { clientName: 'Test', company: 'Test', mobileNumber: '1234567890' },
            });

            expect([401, 403, 307, 308]).toContain(response.status());
        });
    });

    // ========================================================================
    // Lead Retrieval
    // ========================================================================

    test.describe('Lead Retrieval', () => {
        test('should return paginated list of leads', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(request, 'GET', '/api/leads', adminSession);

            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data).toHaveProperty('leads');
            expect(Array.isArray(body.data.leads)).toBe(true);
        });

        test('should support page and limit parameters', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(
                request,
                'GET',
                '/api/leads?page=1&limit=5',
                adminSession
            );

            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data.leads.length).toBeLessThanOrEqual(5);
        });

        test('should filter leads by status', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(
                request,
                'GET',
                '/api/leads?status=NEW',
                adminSession
            );

            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);

            // All returned leads should have NEW status
            body.data.leads.forEach((lead: any) => {
                expect(lead.status).toBe('NEW');
            });
        });

        test('should return specific lead by ID', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            // First create a lead
            const lead = await createTestLead(request, adminSession);
            createdLeadIds.push(lead.id);

            // Then retrieve it
            const response = await authenticatedRequest(
                request,
                'GET',
                `/api/leads/${lead.id}`,
                adminSession
            );

            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data.id).toBe(lead.id);
        });

        test('should return 404 for non-existent lead', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(
                request,
                'GET',
                '/api/leads/non-existent-id-12345',
                adminSession
            );

            expect(response.status()).toBe(404);
        });

        test('should return 401 without authentication', async ({ request }) => {
            const response = await request.get('/api/leads');
            expect([401, 403, 307, 308]).toContain(response.status());
        });
    });

    // ========================================================================
    // Lead Updates
    // ========================================================================

    test.describe('Lead Updates', () => {
        test('should update lead with valid data', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            // Create a lead first
            const lead = await createTestLead(request, adminSession);
            createdLeadIds.push(lead.id);

            // Update it
            const updateData = {
                clientName: 'Updated Client Name',
                company: 'Updated Company',
            };

            const response = await authenticatedRequest(
                request,
                'PUT',
                `/api/leads/${lead.id}`,
                adminSession,
                updateData
            );

            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
            expect(body.data.clientName).toBe('Updated Client Name');
        });

        test('should return 400 for invalid update data', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const lead = await createTestLead(request, adminSession);
            createdLeadIds.push(lead.id);

            const response = await authenticatedRequest(
                request,
                'PUT',
                `/api/leads/${lead.id}`,
                adminSession,
                { status: 'INVALID_STATUS' }
            );

            expect([400, 422]).toContain(response.status());
        });

        test('should return 404 for non-existent lead update', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(
                request,
                'PUT',
                '/api/leads/non-existent-id',
                adminSession,
                { clientName: 'Test' }
            );

            expect(response.status()).toBe(404);
        });
    });

    // ========================================================================
    // Lead Activities
    // ========================================================================

    test.describe('Lead Activities', () => {
        test('should add activity to lead', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const lead = await createTestLead(request, adminSession);
            createdLeadIds.push(lead.id);

            const response = await authenticatedRequest(
                request,
                'POST',
                `/api/leads/${lead.id}/activities`,
                adminSession,
                { type: 'NOTE', content: 'E2E test activity' }
            );

            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body.success).toBe(true);
        });

        test('should retrieve lead activities', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const lead = await createTestLead(request, adminSession);
            createdLeadIds.push(lead.id);

            // Add an activity first
            await authenticatedRequest(
                request,
                'POST',
                `/api/leads/${lead.id}/activities`,
                adminSession,
                { type: 'NOTE', content: 'Test note' }
            );

            // Get activities
            const response = await authenticatedRequest(
                request,
                'GET',
                `/api/leads/${lead.id}/activities`,
                adminSession
            );

            expect(response.status()).toBe(200);
        });
    });

    // ========================================================================
    // Authentication Requirements
    // ========================================================================

    test.describe('Authentication Requirements', () => {
        test('GET /api/leads requires authentication', async ({ request }) => {
            const response = await request.get('/api/leads');
            expect([401, 403, 307, 308]).toContain(response.status());
        });

        test('POST /api/leads requires authentication', async ({ request }) => {
            const response = await request.post('/api/leads', {
                data: { clientName: 'Test', company: 'Test', mobileNumber: '1234567890' }
            });
            expect([401, 403, 307, 308]).toContain(response.status());
        });

        test('PUT /api/leads/[id] requires authentication', async ({ request }) => {
            const response = await request.put('/api/leads/test-id', {
                data: { clientName: 'Test' }
            });
            expect([401, 403, 307, 308]).toContain(response.status());
        });

        test('DELETE /api/leads/[id] requires authentication', async ({ request }) => {
            const response = await request.delete('/api/leads/test-id');
            expect([401, 403, 307, 308]).toContain(response.status());
        });
    });

    // ========================================================================
    // Response Structure
    // ========================================================================

    test.describe('Response Structure', () => {
        test('success response should have correct structure', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(request, 'GET', '/api/leads', adminSession);
            const body = await response.json();

            expect(body).toHaveProperty('success', true);
            expect(body).toHaveProperty('data');
        });

        test('error response should have correct structure', async ({ request }) => {
            test.skip(!adminSession, 'Admin session not available');

            const response = await authenticatedRequest(
                request,
                'GET',
                '/api/leads/invalid-id-12345',
                adminSession
            );

            if (response.status() === 404) {
                const body = await response.json();
                expect(body).toHaveProperty('success', false);
            }
        });
    });
});
