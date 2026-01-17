import { test as base, Page } from '@playwright/test';
import { TEST_DATA } from './test-data';

/*
 * Custom test fixture with authentication built-in
 */
type AuthFixtures = {
    authedPage: Page;
    adminPage: Page;
};

export const test = base.extend<AuthFixtures>({
    authedPage: async ({ page }, use) => {
        await page.goto('/');
        // Check if already logged in (optional logic, but clean slate is safer)
        if (await page.locator('#username').isVisible()) {
            await page.fill('#username', 'admin');
            await page.fill('#password', TEST_DATA.passwords.default);
            await page.click('button[type="submit"]:has-text("Sign In")');
            await page.waitForLoadState('networkidle');
        }
        await use(page);
    },

    adminPage: async ({ page }, use) => {
        // Similar to authedPage but specifically for admin roles if we had RBAC
        await page.goto('/');
        if (await page.locator('#username').isVisible()) {
            await page.fill('#username', 'admin');
            await page.fill('#password', TEST_DATA.passwords.default);
            await page.click('button[type="submit"]:has-text("Sign In")');
            await page.waitForLoadState('networkidle');
        }
        await use(page);
    }
});

export { expect } from '@playwright/test';
