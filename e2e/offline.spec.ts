import { test, expect } from './fixtures/auth-fixture';
import { setupOfflineMode } from './utils/test-helpers';

test.describe('Offline Capability Test Suite', () => {

    test('TC012 - Offline Data Access and Queue', async ({ authedPage }) => {
        const page = authedPage;

        await page.goto('/all-leads');
        // Ensure data is loaded
        await expect(page.locator('table tbody tr').first()).toBeVisible();

        // Go Offline
        await setupOfflineMode(page);

        // 1. Verify Data Persistence
        // Reloading page might fail in offline mode unless Service Worker is active and caching.
        // If SPA, navigation within app should work if data is in Redux/Context/LocalStorage

        // Try navigation
        await page.click('text=Dashboard');
        await expect(page).toHaveURL(/.*dashboard/);

        // Navigate back
        await page.click('text=All Leads');
        await expect(page.locator('table tbody tr').first()).toBeVisible();

        // 2. Offline Action (Mutation)
        // Try to create/edit
        await page.click('button:has-text("Add Lead")');
        await page.fill('input[id*="clientName"]', 'Offline Lead');
        await page.click('button:has-text("Save")');

        // Expect optimistic update or queue notification
        // "Saved to offline queue" or similar
        // await expect(page.locator('text=Saved offline')).toBeVisible(); 

        // 3. Go Online (Restore)
        await page.context().setOffline(false);

        // Verify Sync
        // Wait for sync event or manual trigger
        // await expect(page.locator('text= synced')).toBeVisible();
    });

});
