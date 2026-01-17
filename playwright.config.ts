import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 2, // Retry flaky tests 2 times
    workers: 2, // Use 2 workers for stability as per plan
    reporter: [['html'], ['json', { outputFile: 'test-results/report.json' }]], // Add JSON reporter for TestSprite

    timeout: 60000, // 60s default timeout

    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Dev server already running on port 3000
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120000,
    },
});
