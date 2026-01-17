# Test Execution Documentation

## Overview

This project uses a unified testing infrastructure powered by **Playwright** for End-to-End (E2E), API, and Performance testing. It replaces the legacy fragmented Python/Node setup with a single robust framework.

## Running Tests

### 1. Run All Tests (Unified)
This is the recommended command for CI/CD and final verification. It runs all suites and generates a comprehensive report.
```bash
npm run test:testsprite
# or
npm run test:all
```

### 2. Run Specific Suites
You can run specific test categories using standard Playwright commands:
```bash
# E2E Tests only
npm run test:e2e

# Debug Mode (Headful with Inspector)
npm run test:e2e:debug

# UI Mode (Interactive Watcher)
npx playwright test --ui
```

### 3. View Reports
After running tests, reports are generated in `testsprite_tests/`:
- **Markdown Report:** `testsprite_tests/testsprite-execution-report.md`
- **Dashboard:** Open `testsprite_tests/test-dashboard.html` in your browser.

## Test Organization

Tests are located in `e2e/` directory:
- `auth.spec.ts`: Authentication flows (TC003-TC005)
- `leads-management.spec.ts`: CRUD, Bulk Ops, Search (TC006-TC008)
- `performance.spec.ts`: Virtual scrolling, large datasets (TC009, TC016)
- `import-export.spec.ts`: Data import/export (TC010-TC011)
- `offline.spec.ts`: Offline capabilities (TC012)
- `security.spec.ts`: Security checks (TC013-TC014)
- `api-validation.spec.ts`: API consistency (TC015, TC018)
- `email-sync.spec.ts`: Backend logic verification (TC001-TC002 migrated)
- `installer.spec.ts`: OS interaction placeholders (TC001-TC002, TC017)

## Adding New Tests

1. Create a new spec file in `e2e/`.
2. Use `import { test, expect } from './fixtures/auth-fixture'` if authentication is needed.
3. Add the new test case ID (e.g., `TCxxx`) to the test title.

## Troubleshooting

- **Tests failing on Auth:** Ensure existing admin credentials in `e2e/fixtures/test-data.ts` are correct for your local environment.
- **Port Conflicts:** Ensure port 3000 is available or the app is running on it.
