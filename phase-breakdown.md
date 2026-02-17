# Phase Breakdown

## Task 2: Create Session Adapter for Auth Migration

Create a session adapter to normalize both NextAuth and custom sessions:

- Create lib/api/sessionAdapter.ts with `getUnifiedSession(req)` function
- Implement logic to try custom session first (`getSessionByToken`), fallback to NextAuth
- Return normalized `SessionData` structure (userId, tenantId, role, sessionId)
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\lib\api\withApiHandler.ts` to use adapter when `useNextAuth` is true
- Ensure adapter handles missing tenantId gracefully (for auth routes)
- Add unit tests in tests/api/sessionAdapter.test.ts for both auth paths


## Task 3: Refactor Auth Routes with Declarative Permissions

Refactor authentication routes to use enhanced wrapper with declarative configuration:

- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\auth\login\route.ts` - add `skipTenantCheck: true`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\auth\me\route.ts` - add `skipTenantCheck: true`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\auth\logout\route.ts` - add `skipTenantCheck: true`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\auth\session\route.ts` and `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\auth\session\refresh\route.ts`
- Remove manual `requirePermissions()` calls from these routes
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\auth\password\route.ts`, `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\auth\forgot-password\route.ts`, `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\auth\reset-password\route.ts`
- Ensure all auth routes return standardized response format with `success` field
- Add characterization tests in tests/api/auth.test.ts before refactoring


## Task 4: Refactor Leads Routes with Declarative Permissions

Refactor leads routes to use declarative permission configuration:

- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\leads\route.ts` GET handler - add `permissions: [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ASSIGNED, PERMISSIONS.LEADS_VIEW_ALL]` with `requireAll: false`
- Update POST handler - add `permissions: [PERMISSIONS.LEADS_CREATE]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\leads[id]\route.ts` GET/PUT/DELETE handlers with appropriate permissions
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\leads[id]\assign\route.ts` - add `permissions: [PERMISSIONS.LEADS_ASSIGN]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\leads[id]\forward\route.ts` - add `permissions: [PERMISSIONS.LEADS_FORWARD]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\leads[id]\unassign\route.ts` - add `permissions: [PERMISSIONS.LEADS_REASSIGN]`
- Remove all manual `requirePermissions()` calls from these routes
- Add characterization tests in tests/api/leads-characterization.test.ts


## Task 5: Refactor Documents Routes with Declarative Permissions

Refactor document routes to use declarative permission configuration:

- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\documents\route.ts` GET handler - add `permissions: [PERMISSIONS.DOCUMENTS_VIEW_ALL, PERMISSIONS.DOCUMENTS_VIEW_CASE]` with `requireAll: false`
- Update POST handler - add `permissions: [PERMISSIONS.DOCUMENTS_UPLOAD]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\documents[id]\route.ts` GET/PUT/DELETE handlers with appropriate permissions
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\documents[id]\download\route.ts` - add `permissions: [PERMISSIONS.DOCUMENTS_DOWNLOAD]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\documents[id]\verify\route.ts` - add `permissions: [PERMISSIONS.DOCUMENTS_VERIFY]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\documents[id]\versions\route.ts` with view permissions
- Remove all manual permission checks from these routes
- Add characterization tests in tests/api/documents-characterization.test.ts


## Task 6: Refactor Cases Routes with Declarative Permissions

Refactor case management routes to use declarative permission configuration:

- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\cases\route.ts` GET handler - add `permissions: [PERMISSIONS.CASES_VIEW_OWN, PERMISSIONS.CASES_VIEW_ASSIGNED, PERMISSIONS.CASES_VIEW_ALL]` with `requireAll: false`
- Update POST handler - add `permissions: [PERMISSIONS.CASES_CREATE]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\cases[id]\route.ts` GET/PUT/DELETE handlers with appropriate permissions
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\cases[id]\assign\route.ts` - add `permissions: [PERMISSIONS.CASES_ASSIGN]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\cases[id]\status\route.ts` - add `permissions: [PERMISSIONS.CASES_CHANGE_STATUS]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\cases\bulk-assign\route.ts` - add `permissions: [PERMISSIONS.CASES_ASSIGN]`
- Remove all manual permission checks from these routes


## Task 7: Refactor Workflow and Email Routes

Refactor workflow automation and email routes to use declarative permissions:

- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\workflows\route.ts` - add `permissions: [PERMISSIONS.WORKFLOWS_VIEW]` for GET, `[PERMISSIONS.WORKFLOWS_CREATE]` for POST
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\workflows[id]\route.ts` - add appropriate permissions for GET/PUT/DELETE
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\workflows[id]\activate\route.ts` - add `permissions: [PERMISSIONS.WORKFLOWS_ACTIVATE]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\workflows[id]\test\route.ts` - add `permissions: [PERMISSIONS.WORKFLOWS_TEST]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\email\route.ts` - add `permissions: [PERMISSIONS.EMAIL_VIEW]` for GET, `[PERMISSIONS.EMAIL_SEND]` for POST
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\email\templates\route.ts` and `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\email\campaigns\route.ts` with appropriate permissions
- Remove all manual permission checks from these routes


## Task 8: Refactor Admin and Settings Routes

Refactor administrative and settings routes to use declarative permissions:

- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\tenants\route.ts` - add `permissions: [PERMISSIONS.SETTINGS_MANAGE_TENANTS]`, `skipTenantCheck: true`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\roles\route.ts` - add `permissions: [PERMISSIONS.USERS_MANAGE_ROLES]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\admin\sso\route.ts` - add `permissions: [PERMISSIONS.SETTINGS_MANAGE_SSO]`
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\admin\retention-policies\route.ts` with appropriate permissions
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\api-keys\route.ts` - handle API key auth routes (may need special handling)
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\approvals\route.ts` - add `permissions: [PERMISSIONS.APPROVALS_VIEW]` for GET, `[PERMISSIONS.APPROVALS_APPROVE]` for POST
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\sla\policies\route.ts` - add `permissions: [PERMISSIONS.SLA_MANAGE]`
- Remove all manual permission checks from these routes


## Task 9: Refactor Remaining Routes and Cleanup

Refactor remaining routes and perform cleanup:

- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\reports\builder\route.ts`, `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\reports\export\route.ts`, `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\reports\forecast\route.ts` with appropriate permissions
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\calendar\events\route.ts` with calendar permissions
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\bulk\export\route.ts` and `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\bulk\import\route.ts` with appropriate permissions
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\integrations\route.ts` and integration-related routes
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\oauth\authorize\route.ts`, `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\oauth\token\route.ts` (may need `skipTenantCheck: true`)
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\webhooks\outgoing\route.ts` with appropriate permissions
- Update `h:\Sales-Funnel-3.1  Process department - Flexible\app\api\v1\leads\route.ts` and other v1 API routes
- Remove session adapter from `h:\Sales-Funnel-3.1  Process department - Flexible\lib\api\withApiHandler.ts` if all routes migrated
- Update documentation in `h:\Sales-Funnel-3.1  Process department - Flexible\README.md` with new wrapper usage patterns


## Task 10: Add Integration Tests and Performance Validation

Create comprehensive integration tests and validate performance:

- Create tests/api/wrapper-integration.test.ts to test all wrapper option combinations
- Test permission enforcement across different permission scopes (own/assigned/all)
- Test tenant isolation enforcement (ensure `skipTenantCheck` works correctly)
- Test response format validation (verify warnings are logged for non-standard responses)
- Create tests/api/performance.test.ts to measure response time impact
- Validate DB health check adds <10ms overhead
- Validate session validation time remains ~5-10ms
- Run full E2E test suite in `h:\Sales-Funnel-3.1  Process department - Flexible\e2e` to ensure no regressions
- Document test results and performance metrics in docs/api-refactoring-results.md