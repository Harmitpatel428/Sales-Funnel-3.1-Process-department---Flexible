const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Starting TestSprite Test Execution...');

// Ensure testsprite_tests dir exists
const reportDir = path.join(__dirname, '../testsprite_tests');
if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir);
}

// Generate test files first
try {
    console.log('Generating test files...');
    execSync('node scripts/generate-test-files.js', { stdio: 'inherit' });
} catch (e) {
    console.error('Failed to generate test files:', e);
}

// Tests to run
const tests = [
    'e2e/auth.spec.ts',
    'e2e/leads-management.spec.ts',
    'e2e/performance.spec.ts',
    'e2e/import-export.spec.ts',
    'e2e/offline.spec.ts',
    'e2e/security.spec.ts',
    'e2e/api-validation.spec.ts',
    'e2e/documentation.spec.ts',
    'e2e/email-sync.spec.ts',
    'e2e/installer.spec.ts'
];

// Build command
const command = `npx playwright test ${tests.join(' ')}`;

try {
    console.log(`Running: ${command}`);
    execSync(command, { stdio: 'inherit' });
    console.log('Tests completed successfully.');
} catch (error) {
    console.error('Tests failed (some might be expected during dev). Processing report...');
}

// Generate Report
try {
    console.log('Generating TestSprite Report...');
    execSync('npx tsx testsprite_tests/report-generator.ts', { stdio: 'inherit' });
    console.log('Report generated at testsprite_tests/testsprite-execution-report.md');
} catch (error) {
    console.error('Failed to generate report:', error);
}
