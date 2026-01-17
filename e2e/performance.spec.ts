import { test, expect } from './fixtures/auth-fixture';
import { generateTestLeads, measureScrollPerformance } from './utils/test-helpers';

test.describe('Performance Test Suite', () => {

    // TC009 - Virtual Scrolling Performance
    test('TC009 - Virtual Scrolling Performance', async ({ authedPage }) => {
        const page = authedPage;

        // Mock large dataset
        const largeDataset = generateTestLeads(1000);

        // Intercept API call to return large dataset
        await page.route('**/api/leads*', async route => {
            await route.fulfill({
                json: { data: largeDataset, meta: { total: 1000 } }
            });
        });

        await page.goto('/all-leads');
        await page.waitForLoadState('networkidle');

        // Verify Virtual Scrolling Activation
        // Check number of rendered rows is much less than 1000
        const rowCount = await page.locator('table tbody tr').count();
        console.log(`Rendered rows with 1000 items: ${rowCount}`);
        // Virtual scrolling should only render viewable items + buffer (e.g. 20-50)
        expect(rowCount).toBeLessThan(100);

        // Measure FPS during scroll
        const { avgFps, minFps } = await measureScrollPerformance(page, 'table tbody'); // Ensure selector matches scroll container
        console.log(`Average FPS: ${avgFps}, Min FPS: ${minFps}`);

        // Performance assertions
        expect(avgFps).toBeGreaterThan(30);
    });

    // TC016 - Performance with Large Datasets
    test('TC016 - Performance with Large Datasets', async ({ authedPage }) => {
        const page = authedPage;

        // Mock extremely large dataset
        const largeDataset = generateTestLeads(5000);

        await page.route('**/api/leads*', async route => {
            await route.fulfill({
                json: { data: largeDataset, meta: { total: 5000 } }
            });
        });

        await page.goto('/all-leads');

        // Measure Load Time (First Contentful Point approximation for list)
        const start = Date.now();
        await page.waitForSelector('text=Test Client 1');
        const loadTime = Date.now() - start;
        console.log(`Load time for 5000 records: ${loadTime}ms`);
        expect(loadTime).toBeLessThan(3000); // 3s budget

        // Memory usage check
        const memory = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize);
        if (memory) {
            console.log(`Used JS Heap: ${memory / 1024 / 1024} MB`);
            // Basic sanity check, typically < 100MB for a clean page but large data might push it
            expect(memory).toBeLessThan(200 * 1024 * 1024);
        }

        // Typing responsiveness (debounce check on large list)
        const searchInput = page.locator('input[placeholder*="Search"]');
        await searchInput.type('Test', { delay: 10 });
        // If UI freezes, test will timeout
    });

});
