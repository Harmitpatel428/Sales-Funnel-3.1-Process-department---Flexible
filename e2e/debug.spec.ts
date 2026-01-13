import { test } from '@playwright/test';

test('debug page content', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(5000); // Wait 5s
    
    console.log('Page Title:', await page.title());
    console.log('Body Text:', await page.locator('body').innerText());
    
    const content = await page.content();
    // console.log('--- PAGE CONTENT ---');
    // console.log(content);
    // console.log('--- END CONTENT ---');

    // Check for spinner
    const spinner = page.locator('.animate-spin');
    const isSpinnerVisible = await spinner.isVisible();
    console.log('Spinner visible:', isSpinnerVisible);

    // Check for username
    const username = page.locator('#username');
    const isUsernameVisible = await username.isVisible();
    console.log('Username visible:', isUsernameVisible);
});
