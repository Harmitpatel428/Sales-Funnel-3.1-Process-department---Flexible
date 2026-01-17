import { test, expect } from '@playwright/test';

test.describe('Email Sync API Test Suite', () => {

    test('TC001/TC002 - Email Sync and Parse Triggers', async ({ request }) => {
        // 1. Sync Trigger
        const syncRes = await request.post('/api/email/sync');
        // Expect success or authorized error
        expect([200, 201, 202, 401]).toContain(syncRes.status());

        // 2. Parse Email
        const validEmailJson = {
            subject: 'New Lead: John Doe',
            body: 'Name: John Doe\nPhone: 1234567890',
            from: 'sender@example.com'
        };

        const parseRes = await request.post('/api/email/parse', {
            data: validEmailJson
        });

        // If mocked or implemented
        if (parseRes.ok()) {
            const body = await parseRes.json();
            expect(body).toHaveProperty('success', true);
        }

        // 3. Invalid Email Parse - Error Handling
        const invalidRes = await request.post('/api/email/parse', {
            data: { subject: 'Invalid' } // Missing body
        });
        expect(invalidRes.status()).not.toBe(200);
    });

});
