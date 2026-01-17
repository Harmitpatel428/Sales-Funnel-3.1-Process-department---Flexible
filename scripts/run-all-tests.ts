import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

console.log('Starting TestSprite Unified Test Execution...');

async function run() {
    // Ensure output directory exists
    const resultsDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    try {
        console.log('Running Playwright Tests...');
        // Use env vars for reliable reporter configuration
        execSync('npx playwright test', {
            stdio: 'inherit',
            env: {
                ...process.env,
                CI: 'true',
                PLAYWRIGHT_REPORTER: 'line,json', // Use line for console, json for report
                PLAYWRIGHT_JSON_OUTPUT_NAME: 'test-results/report.json'
            }
        });
    } catch (error) {
        console.log('Playwright execution finished with failures (or just completed). Proceeding to report generation.');
    }

    // 3. Generate Report
    try {
        console.log('Generating TestSprite Report...');
        execSync('npx tsx testsprite_tests/report-generator.ts', { stdio: 'inherit' });
    } catch (error) {
        console.error('Report generation failed', error);
        process.exit(1);
    }

    console.log('TestSprite execution completed.');
}

run();
