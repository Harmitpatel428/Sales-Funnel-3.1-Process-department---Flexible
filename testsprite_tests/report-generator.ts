import * as fs from 'fs';
import * as path from 'path';

const reportPath = path.join(__dirname, '../test-results/report.json');
const outputPath = path.join(__dirname, 'testsprite-execution-report.md');

// Map Playwright tests to TestSprite IDs
const testMapping: Record<string, string> = {
    'TC003': 'TC003 - User Authentication Success',
    'TC004': 'TC004 - User Authentication Failure',
    'TC005': 'TC005 - Password Update Functionality',
    'TC006': 'TC006 - Lead CRUD Operations',
    'TC007': 'TC007 - Bulk Operations on Leads',
    'TC008': 'TC008 - Advanced Search and Filtering',
    'TC009': 'TC009 - Virtual Scrolling Performance',
    'TC010': 'TC010 - Import Lead Data',
    'TC011': 'TC011 - Export Lead Data',
    'TC012': 'TC012 - Offline Operation',
    'TC013': 'TC013 - Local Data Encryption',
    'TC014': 'TC014 - Export Password Protection Strength',
    'TC015': 'TC015 - API Authentication',
    'TC016': 'TC016 - Performance with Large Datasets',
    'TC017': 'TC017 - Shortcut Functionality',
    'TC018': 'TC018 - Validation of API Endpoints Structure',
    'TC019': 'TC019 - Documentation Validation',
    // Mappings for conflicting IDs or extra tests
    'TC001': 'TC001 - Windows Installer Shortcuts / Email Sync',
    'TC002': 'TC002 - Clean Uninstallation / Email Parse'
};

/* 
 * Helper to determine status from deep results structure 
 * Playwright JSON: suite -> specs -> tests (projects) -> results (retries)
 */
function getSpecStatus(spec: any): string {
    let passed = false;
    if (spec.tests) {
        for (const test of spec.tests) {
            if (test.results) {
                for (const result of test.results) {
                    if (result.status === 'passed') {
                        passed = true;
                    }
                }
            }
        }
    }
    // Fallback if structured differently or simpler
    if (!passed && spec.ok) passed = true;

    return passed ? '✅ PASS' : '❌ FAIL';
}

async function generateReport() {
    if (!fs.existsSync(reportPath)) {
        console.error('Report file not found:', reportPath);
        return;
    }

    const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    let md = '# TestSprite Execution Report\n\n';
    md += `**Timestamp:** ${new Date().toISOString()}\n\n`;

    // Update stats from valid data if available
    const total = data.stats?.expected || 0;
    const unexpected = data.stats?.unexpected || 0;
    const passedCount = total - unexpected;

    md += `**Total Tests:** ${total}\n`;
    md += `**Passed:** ${passedCount}\n`;
    md += `**Failed:** ${unexpected}\n\n`;

    md += '## Test Case Results\n\n';

    const results: Record<string, string> = {};

    function traverse(node: any) {
        if (node.specs) {
            node.specs.forEach((spec: any) => {
                const title = spec.title;
                const status = getSpecStatus(spec);

                // Try to match TC ID
                // Handle "TC001/TC002" combined cases by checking for each key
                Object.keys(testMapping).forEach(id => {
                    if (title.includes(id)) {
                        results[id] = status;
                    }
                });
            });
        }
        if (node.suites) {
            node.suites.forEach((child: any) => traverse(child));
        }
    }

    traverse(data);

    for (const [id, name] of Object.entries(testMapping)) {
        const status = results[id] || '⚠️ SKIPPED/UNKNOWN';
        md += `- **${id}**: ${status} - ${name}\n`;
    }

    fs.writeFileSync(outputPath, md);
}

generateReport();
