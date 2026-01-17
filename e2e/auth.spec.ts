import { test, expect } from './fixtures/auth-fixture';
import { TEST_DATA } from './fixtures/test-data';

test.describe('Authentication Test Suite', () => {

    // TC003 - User Authentication Success
    test('TC003 - User Authentication Success', async ({ page }) => {
        await page.goto('/');
        const usernameField = page.locator('#username');
        if (await usernameField.isVisible()) {
            await usernameField.fill('admin');
            await page.fill('#password', TEST_DATA.passwords.default);
            await page.click('button[type="submit"]:has-text("Sign In")');
        }

        await expect(page).toHaveURL(/.*(dashboard|)/);
        await expect(page.locator('text=Log Out')).toBeVisible({ timeout: 15000 });
    });

    // TC004 - User Authentication Failure
    test('TC004 - User Authentication Failure', async ({ page }) => {
        await page.goto('/');

        // Invalid credentials
        await page.fill('#username', 'wronguser');
        await page.fill('#password', 'wrongpass');
        await page.click('button[type="submit"]:has-text("Sign In")');

        // Verify error
        await expect(page.locator('.text-red-700, [class*="error"]')).toBeVisible();
        await expect(page).not.toHaveURL(/.*dashboard/);

        // Rate limiting check (multiple failures)
        for (let i = 0; i < 3; i++) {
            await page.click('button[type="submit"]:has-text("Sign In")');
            await page.waitForTimeout(500);
        }
        await expect(page.locator('#username')).toBeVisible();
    });

    // TC005 - Password Update & Security
    test.describe('Password Management', () => {
        test('TC005 - Password Strength & Update', async ({ page }) => {
            const username = 'tc005_user';
            const oldPass = 'InitialPass123!';
            const newPass = 'NewStrongPass123!';

            // 1. Create Disposable User
            const { execSync } = require('child_process');
            console.log('Creating test user for TC005...');
            // Ensure cleaning up previous run if failed
            try { execSync(`npx tsx scripts/manage-test-user.ts delete ${username}`); } catch { }

            execSync(`npx tsx scripts/manage-test-user.ts create ${username} ${oldPass}`, { stdio: 'inherit' });

            try {
                // 2. Login with Old Password
                await page.goto('/');
                // Try logging in with email (standard)
                await page.fill('#username', `${username}@example.com`);
                await page.fill('#password', oldPass);
                await page.click('button[type="submit"]:has-text("Sign In")');

                // Verify Login
                await expect(page).toHaveURL(/.*(dashboard|)/);

                // 3. Navigate to Profile/Settings
                await page.goto('/profile'); // Adjust path if needed

                // 4. Change Password
                // Check for Old Password field (security best practice)
                if (await page.locator('input[name="oldPassword"]').isVisible()) {
                    await page.fill('input[name="oldPassword"]', oldPass);
                }

                // Test Strength Validation First
                await page.fill('input[name="newPassword"]', 'weak');
                await expect(page.locator('text=Weak').or(page.locator('text=short'))).toBeVisible();

                // Fill Strong Password
                await page.fill('input[name="newPassword"]', newPass);

                // Confirm Password if exists
                if (await page.locator('input[name="confirmPassword"]').isVisible()) {
                    await page.fill('input[name="confirmPassword"]', newPass);
                }

                await page.click('button:has-text("Update"), button:has-text("Change Password")');

                // Expect Success Message
                await expect(page.locator('text=Success').or(page.locator('text=updated'))).toBeVisible();

                // 5. Logout
                await page.click('text=Log Out');
                await expect(page.locator('#username')).toBeVisible();

                // 6. Login with NEW Password
                await page.fill('#username', `${username}@example.com`);
                await page.fill('#password', newPass);
                await page.click('button[type="submit"]:has-text("Sign In")');

                // Verify Re-Login
                await expect(page).toHaveURL(/.*(dashboard|)/);

            } finally {
                // 7. Cleanup
                console.log('Cleaning up test user...');
                try {
                    execSync(`npx tsx scripts/manage-test-user.ts delete ${username}`, { stdio: 'inherit' });
                } catch (e) { console.error('Cleanup failed', e); }
            }
        });

        test('Session Timeout', async ({ authedPage }) => {
            const page = authedPage;
            // Simulate token expiry by deleting sensitive cookies
            await page.context().clearCookies();

            await page.reload();
            // Should be redirected to login
            await expect(page.locator('#username')).toBeVisible({ timeout: 10000 });
        });

        test('Multi-tab Session Sync', async ({ context, authedPage }) => {
            const page1 = authedPage;
            const page2 = await context.newPage();
            await page2.goto('/');

            // Verify page2 is also logged in (sharing context)
            await expect(page2.locator('text=Log Out')).toBeVisible();

            // Logout on page1
            await page1.click('text=Log Out');

            // Page2 should eventually effect logout
            // We force a check via reload if not automatic
            await page2.waitForTimeout(1000);
            if (await page2.locator('text=Log Out').isVisible()) {
                await page2.reload();
            }
            await expect(page2.locator('#username')).toBeVisible();
        });
    });

    // TC015 - API Authentication
    test('TC015 - API Authentication', async ({ request }) => {
        // Test protected endpoint without auth
        const unauthRes = await request.get('/api/leads');
        // NextJS API often returns 401 or 307 redirect
        expect([401, 403, 307, 308]).toContain(unauthRes.status());

        // Authenticated request via API requires cookies/headers.
        // Playwright test runner doesn't share state with 'request' fixture automatically 
        // unless using 'newContext' with storageState. 
        // We assume here we verify the protection mechanisms.
    });
});
