import { test, expect } from './fixtures/auth-fixture';
import { generateTestLeads } from './utils/test-helpers';

test.describe('Lead Management', () => {

    test('TC006 - Lead CRUD Operations', async ({ authedPage }) => {
        const page = authedPage;

        // 1. Create Lead
        const newLead = generateTestLeads(1)[0];

        await page.goto('/add-lead'); // Adjust if route differs
        // Wait for form
        await expect(page.locator('form')).toBeVisible();

        await page.fill('input[id*="clientName"]', newLead.clientName);
        await page.fill('input[id*="mobileNumber"]', newLead.mobileNumber);
        await page.fill('input[id*="company"]', newLead.companyName);
        // Fill other required fields if any (e.g. Status default)

        await page.click('button:has-text("Save"), button:has-text("Create")');

        // Verify creation
        await expect(page).toHaveURL(/.*dashboard|.*all-leads/);
        await expect(page.locator(`text=${newLead.clientName}`)).toBeVisible();

        // 2. Edit Lead
        await page.click(`text=${newLead.clientName}`);
        // Assuming this opens a modal or navigates to details

        // Update name
        const updatedName = `${newLead.clientName} Updated`;
        await page.fill('input[id*="clientName"]', updatedName);
        await page.click('button:has-text("Save"), button:has-text("Update")');

        // Verify update
        await expect(page.locator(`text=${updatedName}`)).toBeVisible();

        // 3. Delete Lead
        // Locate delete button (often requires opening menu or specific UI)
        // We assume it's available or inside a "More" menu
        const deleteBtn = page.locator('button[aria-label="Delete"], button:has-text("Delete")');
        if (await deleteBtn.isVisible()) {
            await deleteBtn.click();
        } else {
            // Try context menu or row action
            // Skipping specific UI logic as it varies, but logging intent
            console.log('Delete button not immediately found, checking common patterns');
            const menuBtn = page.locator('button[aria-label="More actions"]');
            if (await menuBtn.isVisible()) {
                await menuBtn.click();
                await page.click('text=Delete');
            }
        }

        // Confirm deletion if modal appears
        if (await page.locator('button:has-text("Confirm")').isVisible()) {
            await page.click('button:has-text("Confirm")');
        }

        // Verify deletion
        await expect(page.locator(`text=${updatedName}`)).not.toBeVisible();
    });

    test('TC007 - Bulk Operations on Leads', async ({ authedPage }) => {
        const page = authedPage;
        await page.goto('/all-leads');

        // Select multiple leads
        const checkboxes = page.locator('input[type="checkbox"]');
        if (await checkboxes.count() > 2) {
            await checkboxes.nth(1).check();
            await checkboxes.nth(2).check();

            // Perform Bulk Update
            const bulkActions = page.locator('button:has-text("Bulk Actions"), button:has-text("Actions")');
            if (await bulkActions.isVisible()) {
                await bulkActions.click();

                // Example: Bulk Status Change
                const statusOption = page.locator('text=Change Status');
                if (await statusOption.isVisible()) {
                    await statusOption.click();
                    await page.click('text=Follow-up'); // Select new status
                    await page.click('button:has-text("Apply")');

                    // Validation would need to check individual rows update
                    await expect(page.locator('text=Updated successfully')).toBeVisible();
                }
            }

            // Bulk Delete verification
            // Ideally we don't delete random data unless setup, so we skip actual click
            // await page.click('text=Delete Selected');
        }
    });

    test('TC008 - Advanced Search and Filtering', async ({ authedPage }) => {
        const page = authedPage;
        await page.goto('/all-leads');

        // 1. Debounce Check
        const searchInput = page.locator('input[placeholder*="Search"]');

        // Setup request interception to verify debounce
        let requestCount = 0;
        await page.route('**/api/leads*', async route => {
            requestCount++;
            await route.continue();
        });

        await searchInput.type('Test Query', { delay: 50 }); // Fast typing
        // Debounce should prevent multiple requests per keystroke
        // We expect fewer requests than characters (10 chars)

        await page.waitForTimeout(1000); // Wait for debounce to settle
        expect(requestCount).toBeLessThan(5); // Should be 1 or 2 typically

        // 2. Filter Memoization / Performance
        const filterBtn = page.locator('button:has-text("Filter")');
        if (await filterBtn.isVisible()) {
            await filterBtn.click();
            await page.click('text=New'); // Select status
            // Verify URL update for shareable filters
            await expect(page).toHaveURL(/.*status=New.*/);
        }
    });

});
