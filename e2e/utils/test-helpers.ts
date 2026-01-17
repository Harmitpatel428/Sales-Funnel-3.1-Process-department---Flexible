import { Page, expect, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Types
export interface TestLead {
    clientName: string;
    mobileNumber: string;
    companyName: string;
    status: 'New' | 'Busy' | 'Follow-up' | 'CNR' | 'Not Interested' | 'Deal Won' | 'Deal Lost' | 'Wrong Number' | 'Meeting Booked' | 'Junk Lead' | 'In Progress' | 'Qualified' | 'Unqualified';
    notes?: string;
    email?: string;
}

/**
 * Generate test lead data with realistic values
 */
export function generateTestLeads(count: number): TestLead[] {
    const leads: TestLead[] = [];
    const statuses = ['New', 'Busy', 'Follow-up', 'CNR', 'Qualified', 'In Progress'];

    for (let i = 0; i < count; i++) {
        leads.push({
            clientName: `Test Client ${i + 1}`,
            mobileNumber: `98765${String(i).padStart(5, '0')}`,
            companyName: `Test Corp ${Math.floor(i / 10) + 1}`,
            status: statuses[i % statuses.length] as TestLead['status'],
            email: `test${i}@example.com`,
            notes: `Generated test lead ${i + 1}`
        });
    }

    return leads;
}

/**
 * Handle file upload for import tests
 */
export async function importLeadsFromFile(page: Page, filePath: string, password?: string) {
    // Navigate to import page if not already there
    if (!page.url().includes('import-leads')) {
        await page.goto('/import-leads');
    }

    // Wait for file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Handle password if required
    if (password) {
        const passwordInput = page.locator('input[type="password"]');
        await expect(passwordInput).toBeVisible({ timeout: 5000 });
        await passwordInput.fill(password);
    }

    // Click import/upload button
    const importButton = page.locator('button:has-text("Import"), button:has-text("Upload")');
    await importButton.click();

    // Wait for completion (adjust selector based on actual UI)
    await page.locator('.import-success, .text-green-600').waitFor({ state: 'visible', timeout: 30000 });
}

/**
 * Trigger export and validate file creation
 */
export async function exportLeadsToFile(page: Page, format: 'xlsx' | 'csv', password?: string): Promise<string> {
    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent('download');

    // Select format and trigger export
    await page.click(`button:has-text("Export")`);
    await page.click(`text=${format.toUpperCase()}`);

    if (password) {
        const passwordInput = page.locator('input[name="password"], input[placeholder*="Password"]');
        await passwordInput.fill(password);
        await page.click('button:has-text("Confirm"), button:has-text("Download")');
    }

    const download = await downloadPromise;
    const downloadPath = path.join('test-downloads', download.suggestedFilename());

    // Ensure directory exists
    if (!fs.existsSync('test-downloads')) {
        fs.mkdirSync('test-downloads');
    }

    await download.saveAs(downloadPath);
    return downloadPath;
}

/**
 * Capture FPS metrics during scroll
 */
export async function measureScrollPerformance(page: Page, selector: string = 'table, .virtual-list'): Promise<{ avgFps: number, minFps: number }> {
    // Evaluate performance in browser context
    return await page.evaluate(async (sel) => {
        return new Promise((resolve) => {
            let frames = 0;
            let minFps = 60;
            let lastTime = performance.now();
            let avgFpsTotal = 0;
            let avgFpsCount = 0;

            const container = document.querySelector(sel) || document.body;

            // Start time of test
            const startTime = performance.now();

            const measure = () => {
                const now = performance.now();
                const delta = now - lastTime;

                frames++;

                if (delta >= 1000) {
                    const fps = Math.round((frames * 1000) / delta);
                    minFps = Math.min(minFps, fps);
                    avgFpsTotal += fps;
                    avgFpsCount++;
                    frames = 0;
                    lastTime = now;
                }

                // Scroll
                if (container === document.body) {
                    window.scrollBy(0, 10);
                } else {
                    container.scrollTop += 10;
                }

                // Check termination
                const isAtBottom = (container === document.body ? window.scrollY + window.innerHeight >= document.body.scrollHeight : container.scrollTop + container.clientHeight >= container.scrollHeight);
                const isTimeout = now - startTime > 10000; // 10s max

                if (isAtBottom || isTimeout) {
                    const finalAvg = avgFpsCount > 0 ? Math.round(avgFpsTotal / avgFpsCount) : 60;
                    // Ensure we don't return 0 if short run
                    const initial = finalAvg === 0 ? 60 : finalAvg;
                    resolve({ avgFps: initial, minFps: minFps === 60 ? initial : minFps });
                    return;
                }

                requestAnimationFrame(measure);
            };

            requestAnimationFrame(measure);
        });
    }, selector);
}

/**
 * Deep comparison of lead data
 */
export function validateDataIntegrity(expected: any, actual: any): boolean {
    return JSON.stringify(expected) === JSON.stringify(actual);
}

/**
 * Configure network interception for offline testing
 */
export async function setupOfflineMode(page: Page) {
    await page.context().setOffline(true);
}

/**
 * Remove test leads after test completion via API
 */
export async function cleanupTestData(request: APIRequestContext, leadIds: string[]) {
    // Using bulk delete if available, or loop
    // Assuming there's a bulk delete endpoint or single delete
    for (const id of leadIds) {
        try {
            await request.delete(`/api/leads/${id}`);
        } catch (e) {
            console.error(`Failed to delete lead ${id}`, e);
        }
    }
}
