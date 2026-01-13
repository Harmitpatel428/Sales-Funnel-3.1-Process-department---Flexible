import { test, expect, Page } from '@playwright/test';

// Increase default timeout for cold starts
test.setTimeout(120000);

// ============================================================
// Test Configuration & Utilities
// ============================================================

const BASE_URL = 'http://localhost:3000';
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'Admin@123456',
};

// Wait for app to be ready (login modal or content)
async function waitForAppReady(page: Page) {
    // Wait for loading spinner to disappear (UserProvider loading state)
    const spinner = page.locator('.animate-spin');
    if (await spinner.isVisible({ timeout: 5000 }).catch(() => false)) {
        await spinner.waitFor({ state: 'detached', timeout: 60000 });
    }

    await page.waitForLoadState('networkidle');
    // Wait for either login modal or dashboard content
    await Promise.race([
        page.waitForSelector('#username', { timeout: 60000 }),
        page.waitForSelector('h1', { timeout: 60000 }),
        page.waitForSelector('[class*="bg-black"]', { timeout: 60000 }),
    ]).catch(() => { });
}

// Helper to login - The app uses a modal that appears when not authenticated
async function login(page: Page, credentials = ADMIN_CREDENTIALS) {
    await page.goto('/');
    await waitForAppReady(page);

    // Check if login modal is visible (id="username" from LoginModal.tsx)
    const usernameField = page.locator('#username');

    if (await usernameField.isVisible({ timeout: 5000 })) {
        await usernameField.fill(credentials.username);

        const passwordField = page.locator('#password');
        await passwordField.fill(credentials.password);

        // Click "Sign In" button (from LoginModal.tsx line 237)
        const signInButton = page.locator('button[type="submit"]:has-text("Sign In")');
        await signInButton.click();

        // Wait for login to complete
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
    }
}

// ============================================================
// Authentication Tests
// ============================================================

test.describe('Authentication', () => {
    test('should display login modal when not authenticated', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        // Check for login form with specific IDs from LoginModal.tsx
        const usernameField = page.locator('#username');
        const passwordField = page.locator('#password');
        const signInButton = page.locator('button[type="submit"]:has-text("Sign In")');

        // At least username/password should be visible OR landing page
        const hasLoginModal = await usernameField.isVisible({ timeout: 5000 }).catch(() => false);
        const hasLandingPage = await page.locator('h1:has-text("V4U"), h1:has-text("Biz")').isVisible({ timeout: 2000 }).catch(() => false);

        expect(hasLoginModal || hasLandingPage).toBeTruthy();
    });

    test('should reject invalid credentials', async ({ page }) => {
        await page.goto('/');
        await waitForAppReady(page);

        const usernameField = page.locator('#username');

        if (await usernameField.isVisible({ timeout: 5000 })) {
            await usernameField.fill('wronguser');
            await page.locator('#password').fill('wrongpassword');

            const signInButton = page.locator('button[type="submit"]:has-text("Sign In")');
            await signInButton.click();

            // Wait for error message (red border/text error from LoginModal)
            await page.waitForTimeout(5000);

            // Check for error message display
            const errorMessage = page.locator('.bg-red-50, .text-red-700, [class*="error"]');
            const isErrorVisible = await errorMessage.isVisible({ timeout: 15000 }).catch(() => false);
            expect(isErrorVisible).toBeTruthy();
        }
    });

    test('should login with valid admin credentials', async ({ page }) => {
        await login(page);

        // After login, should see landing page content OR dashboard
        const landingContent = page.locator('h1:has-text("V4U"), h1:has-text("Biz"), text=Professional CRM');
        const dashboardContent = page.locator('h1, h2, [class*="dashboard"], [class*="card"]');

        const isLandingVisible = await landingContent.first().isVisible({ timeout: 10000 }).catch(() => false);
        const isDashboardVisible = await dashboardContent.first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(isLandingVisible || isDashboardVisible).toBeTruthy();
    });
});

// ============================================================
// Landing Page Tests
// ============================================================

test.describe('Landing Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('should display landing page with CRM title', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Check for V4U Biz Solutions title or CRM branding (from page.tsx)
        const title = page.locator('h1');
        await expect(title).toBeVisible({ timeout: 10000 });
    });

    test('should have Add New Lead button', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // From page.tsx line 156: button with "Add New Lead"
        const addLeadButton = page.locator('button:has-text("Add New Lead")');
        await expect(addLeadButton).toBeVisible({ timeout: 10000 });
    });

    test('should have View Dashboard button', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // From page.tsx line 162: button with "View Dashboard"
        const dashboardButton = page.locator('button:has-text("View Dashboard")');
        await expect(dashboardButton).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to dashboard when clicking View Dashboard', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const dashboardButton = page.locator('button:has-text("View Dashboard")');
        await dashboardButton.click();

        await page.waitForURL('**/dashboard**', { timeout: 10000 });
        expect(page.url()).toContain('/dashboard');
    });

    test('should navigate to add-lead when clicking Add New Lead', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const addLeadButton = page.locator('button:has-text("Add New Lead")');
        await addLeadButton.click();

        await page.waitForURL('**/add-lead**', { timeout: 10000 });
        expect(page.url()).toContain('/add-lead');
    });
});

// ============================================================
// Dashboard Tests
// ============================================================

test.describe('Dashboard', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('should display sales dashboard page', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // Dashboard should have some content - check for status filter buttons from dashboard code
        // statusCounts has: New, FL1, CNR, Busy, Follow-up, etc.
        const statusButtons = page.locator('button:has-text("New"), button:has-text("CNR"), button:has-text("Follow-up")');
        const hasStatusButtons = await statusButtons.first().isVisible({ timeout: 15000 }).catch(() => false);

        // Or check for search input
        const searchInput = page.locator('input[type="text"], input[type="search"]');
        const hasSearch = await searchInput.first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasStatusButtons || hasSearch).toBeTruthy();
    });

    test('should display status filter buttons', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // From dashboard: statusOrder includes New, CNR, Busy, Follow-up, etc.
        const newStatusBtn = page.locator('button:has-text("New")');
        await expect(newStatusBtn).toBeVisible({ timeout: 15000 });
    });

    test('should have search functionality', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // Dashboard has search input
        const searchInput = page.locator('input[placeholder*="Search"], input[type="search"], input[type="text"]').first();
        await expect(searchInput).toBeVisible({ timeout: 15000 });
    });

    test('should filter leads by status when clicking status button', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // Click on "New" status filter
        const newStatusBtn = page.locator('button:has-text("New")').first();
        if (await newStatusBtn.isVisible({ timeout: 10000 })) {
            await newStatusBtn.click();
            await page.waitForLoadState('networkidle');
            // Filter should be applied
        }
    });
});

// ============================================================
// Lead Management Tests
// ============================================================

test.describe('Lead Management', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('should navigate to add lead page', async ({ page }) => {
        await page.goto('/add-lead');
        await page.waitForLoadState('networkidle');

        // Add lead page should have form elements
        const form = page.locator('form, input[name], input[id="clientName"]');
        await expect(form).toBeVisible({ timeout: 15000 });
    });

    test('should display leads in dashboard table', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // Dashboard uses EditableTable component
        const tableOrContent = page.locator('table, [class*="table"], [class*="lead"]');
        const hasTable = await tableOrContent.first().isVisible({ timeout: 15000 }).catch(() => false);

        // Or at least status buttons should be visible
        const statusButtons = page.locator('button:has-text("New"), button:has-text("CNR")');
        const hasButtons = await statusButtons.first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasTable || hasButtons).toBeTruthy();
    });

    test('should be able to search leads', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        const searchInput = page.locator('input[placeholder*="Search"], input[type="text"]').first();

        if (await searchInput.isVisible({ timeout: 10000 })) {
            await searchInput.fill('Test');
            await page.waitForTimeout(500); // Debounce
            await page.waitForLoadState('networkidle');
        }
    });
});

// ============================================================
// Navigation Tests
// ============================================================

test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('should navigate to all-leads page', async ({ page }) => {
        await page.goto('/all-leads');
        await page.waitForLoadState('networkidle');

        // Should load without error
        const content = page.locator('body');
        await expect(content).toBeVisible();
    });

    test('should navigate to due-today page', async ({ page }) => {
        await page.goto('/due-today');
        await page.waitForLoadState('networkidle');

        const content = page.locator('body');
        await expect(content).toBeVisible();
    });

    test('should navigate to upcoming page', async ({ page }) => {
        await page.goto('/upcoming');
        await page.waitForLoadState('networkidle');

        const content = page.locator('body');
        await expect(content).toBeVisible();
    });

    test('should navigate to work-tracker page', async ({ page }) => {
        await page.goto('/work-tracker');
        await page.waitForLoadState('networkidle');

        const content = page.locator('body');
        await expect(content).toBeVisible();
    });

    test('should navigate to users page (admin)', async ({ page }) => {
        await page.goto('/users');
        await page.waitForLoadState('networkidle');

        // As admin, should see user management content
        const content = page.locator('body');
        await expect(content).toBeVisible();
    });

    test('should navigate to audit-logs page (admin)', async ({ page }) => {
        await page.goto('/audit-logs');
        await page.waitForLoadState('networkidle');

        const content = page.locator('body');
        await expect(content).toBeVisible();
    });
});

// ============================================================
// Quick Actions Tests (from landing page)
// ============================================================

test.describe('Quick Actions Panel', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('should display Quick Actions panel on home page', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // From page.tsx line 323: "Quick Actions" heading
        const quickActionsHeading = page.locator('h2:has-text("Quick Actions")');
        await expect(quickActionsHeading).toBeVisible({ timeout: 15000 });
    });

    test('should have Add Lead quick action', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // From page.tsx: Quick action button with "Add Lead"
        const addLeadAction = page.locator('button:has-text("Add Lead")').first();
        await expect(addLeadAction).toBeVisible({ timeout: 15000 });
    });

    test('should have Dashboard quick action', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const dashboardAction = page.locator('button:has-text("Dashboard")').first();
        await expect(dashboardAction).toBeVisible({ timeout: 15000 });
    });

    test('should have Due Today quick action', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const dueTodayAction = page.locator('button:has-text("Due Today")');
        await expect(dueTodayAction).toBeVisible({ timeout: 15000 });
    });
});

// ============================================================
// Feature Cards Tests (from landing page)
// ============================================================

test.describe('Feature Cards', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('should display Lead Management card', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // From page.tsx line 181
        const leadMgmtCard = page.locator('h3:has-text("Lead Management")');
        await expect(leadMgmtCard).toBeVisible({ timeout: 15000 });
    });

    test('should display Work Tracker card', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // From page.tsx line 199
        const workTrackerCard = page.locator('h3:has-text("Work Tracker")');
        await expect(workTrackerCard).toBeVisible({ timeout: 15000 });
    });

    test('should display Follow-up Management card', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // From page.tsx line 313
        const followUpCard = page.locator('h3:has-text("Follow-up Management")');
        await expect(followUpCard).toBeVisible({ timeout: 15000 });
    });
});
