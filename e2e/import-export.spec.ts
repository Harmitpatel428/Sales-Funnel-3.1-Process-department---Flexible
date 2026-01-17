import { test, expect } from './fixtures/auth-fixture';
import * as path from 'path';
import * as fs from 'fs';
import { importLeadsFromFile, exportLeadsToFile } from './utils/test-helpers';
import { TEST_DATA } from './fixtures/test-data';

test.describe('Import/Export Test Suite', () => {

    // TC010 - Import Lead Data
    test('TC010 - Import Lead Data', async ({ authedPage }) => {
        const page = authedPage;

        // 1. Valid Excel Import
        const startCount = await page.locator('table tbody tr').count();

        const filePath = path.resolve(TEST_DATA.files.xlsx);
        await importLeadsFromFile(page, filePath);

        // Verify success message
        await expect(page.locator('text=Import Successful').or(page.locator('text=Success'))).toBeVisible({ timeout: 10000 });

        // 2. CSV Import
        const csvPath = path.resolve(TEST_DATA.files.csv);
        await importLeadsFromFile(page, csvPath);
        await expect(page.locator('text=Import Successful').or(page.locator('text=Success'))).toBeVisible();

        // 3. Password Protected Import (if supported)
        const protectedPath = path.resolve(TEST_DATA.files.xlsx_protected);
        // Assuming implementation asks for password
        await importLeadsFromFile(page, protectedPath, TEST_DATA.passwords.import);
    });

    // TC011 - Export Lead Data
    test('TC011 - Export Lead Data', async ({ authedPage }) => {
        const page = authedPage;
        await page.goto('/all-leads');

        // 1. Export XLSX
        // Note: Password protection for export is usually an option in the dialog
        const downloadPath = await exportLeadsToFile(page, 'xlsx', TEST_DATA.passwords.export);
        expect(fs.existsSync(downloadPath)).toBeTruthy();

        console.log(`Exported file to: ${downloadPath}`);

        // 2. Export CSV
        const csvPath = await exportLeadsToFile(page, 'csv');
        expect(fs.existsSync(csvPath)).toBeTruthy();

        // Validate content brief check
        const content = fs.readFileSync(csvPath, 'utf-8');
        expect(content.length).toBeGreaterThan(0);
    });

});
