
import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

async function main() {
    console.log('Verifying password for testuser (direct bcrypt)...');
    const user = await prisma.user.findFirst({
        where: { username: 'testuser' }
    });

    if (!user) {
        console.error('User not found!');
        return;
    }

    const testPassword = 'correct_password';
    console.log(`Testing password: '${testPassword}' against hash...`);
    const isValid = await bcrypt.compare(testPassword, user.password);

    console.log(`Password verification result: ${isValid}`);
    if (isValid) {
        console.log('SUCCESS: The stored password hash MATCHES "correct_password".');
    } else {
        console.log('FAILURE: The stored password hash DOES NOT match "correct_password".');

        // Update it to correct one
        console.log('Fixing password now...');
        const newHash = await bcrypt.hash(testPassword, 12);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: newHash,
                failedLoginAttempts: 0,
                lockedUntil: null
            }
        });
        console.log('Password updated to "correct_password".');
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end.

## Key Observations

The codebase has a **dual authentication system**: a custom JWT-based authentication (`file:lib/auth.ts`) for regular login and NextAuth for SSO providers. However, several API routes inconsistently use `getServerSession()` from NextAuth instead of the custom `getSession()`, causing authentication failures for password-based users. The frontend `file:app/context/UserContext.tsx` properly calls server actions, but session synchronization needs strengthening. The database schema supports comprehensive session management, MFA, and RBAC, but implementation is incomplete across API routes.

## Approach

Standardize authentication across the entire application by ensuring all API routes use the custom JWT session system (`getSession()` from `file:lib/auth.ts`). Replace inconsistent NextAuth usage with the unified session approach, add authentication guards to unprotected routes, strengthen session validation, and complete the MFA flow integration. This approach maintains the existing SSO capability while ensuring consistent authentication enforcement throughout the backend.

## Implementation Steps

### 1. Audit and Standardize API Route Authentication

**Objective**: Ensure all API routes use `getSession()` from `file:lib/auth.ts` for authentication.

#### 1.1 Replace NextAuth Usage in API Routes

Update the following files to replace `getServerSession()` with `getSession()`:

- **`file:app/api/documents/route.ts`**
  - Replace `getServerSession(authOptions)` with `getSession()` from `@/lib/auth`
  - Remove NextAuth imports
  - Update session access pattern from `session?.user?.id` to `session?.userId`
  - Ensure tenant context is retrieved from `session.tenantId`

- **`file:app/api/email/route.ts`**
  - Replace `getServerSession()` with `getSession()` from `@/lib/auth`
  - Remove NextAuth imports
  - Update all session property accesses to use custom session structure
  - Replace permission check helper to use `requirePermissions` middleware from `file:lib/middleware/permissions.ts`

#### 1.2 Add Authentication Guards to All API Routes

Systematically add authentication checks to all routes in `file:app/api` directory:

```mermaid
sequenceDiagram
    participant Client
    participant API Route
    participant getSession
    participant Database
    participant Business Logic

    Client->>API Route: HTTP Request
    API Route->>getSession: Validate session
    getSession->>Database: Check session token
    Database-->>getSession: Session data
    alt Session Invalid
        getSession-->>API Route: null
        API Route-->>Client: 401 Unauthorized
    else Session Valid
        getSession-->>API Route: Session object
        API Route->>Business Logic: Process request
        Business Logic-->>API Route: Response
        API Route-->>Client: Success response
    end
```

**Routes requiring authentication guards:**

- All routes under `file:app/api/admin/`
- All routes under `file:app/api/analytics/`
- All routes under `file:app/api/api-keys/`
- All routes under `file:app/api/approvals/`
- All routes under `file:app/api/calendar/`
- All routes under `file:app/api/documents/` (update existing)
- All routes under `file:app/api/email/` (update existing)
- All routes under `file:app/api/integrations/`
- All routes under `file:app/api/lead-scoring/`
- All routes under `file:app/api/oauth/`
- All routes under `file:app/api/reports/`
- All routes under `file:app/api/roles/`
- All routes under `file:app/api/sla/`
- All routes under `file:app/api/tenants/`
- All routes under `file:app/api/v1/`
- All routes under `file:app/api/webhooks/`
- All routes under `file:app/api/workflows/`

**Standard authentication pattern to apply:**

```typescript
const session = await getSession();
if (!session) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### 2. Strengthen Session Management

**Objective**: Ensure robust session validation and synchronization between frontend and backend.

#### 2.1 Update UserContext Session Handling

Modify `file:app/context/UserContext.tsx`:

- Add session refresh mechanism on window focus to detect session expiry
- Implement automatic logout when session becomes invalid
- Add session heartbeat to update `lastActivityAt` in database
- Handle session expiry gracefully with user notification
- Ensure `refreshUser()` is called after successful MFA verification

#### 2.2 Enhance Session Validation in lib/auth.ts

Update `file:lib/auth.ts`:

- Add session activity timeout check (e.g., 30 minutes of inactivity)
- Implement session rotation after privilege changes
- Add concurrent session limit per user (optional security feature)
- Ensure `getSession()` updates `lastActivityAt` on every call (already implemented)
- Add session invalidation on password change

### 3. Complete MFA Integration

**Objective**: Ensure MFA flow works end-to-end from login to verification.

#### 3.1 Fix Login Flow with MFA

Update `file:app/actions/auth.ts` `loginAction()`:

- After password verification, check if user has `mfaEnabled: true`
- If MFA enabled, return `{ success: true, mfaRequired: true, userId: user.id }` WITHOUT creating session
- Store temporary MFA state in database (e.g., pending MFA verification)
- Only create session after MFA verification succeeds

#### 3.2 Update LoginModal MFA Handling

Modify `file:app/components/LoginModal.tsx`:

- Ensure `handleMfaVerify()` properly calls `/api/auth/mfa/verify`
- After successful MFA verification, call `refreshUser()` to update UserContext
- Handle MFA verification errors with specific messages
- Add support for backup codes

#### 3.3 Verify MFA API Endpoints

Ensure these endpoints are properly implemented:

- `file:app/api/auth/mfa/setup/route.ts` - Generate TOTP secret
- `file:app/api/auth/mfa/verify/route.ts` - Verify MFA code and create session
- `file:app/api/auth/mfa/verify-setup/route.ts` - Verify setup code
- `file:app/api/auth/mfa/disable/route.ts` - Disable MFA
- `file:app/api/auth/mfa/send-code/route.ts` - Send SMS/Email code

### 4. Implement Consistent Permission Middleware

**Objective**: Apply permission checks consistently across all protected routes.

#### 4.1 Apply Permission Middleware to API Routes

Use `requirePermissions()` from `file:lib/middleware/permissions.ts`:

**Example pattern:**
```typescript
const permissionError = await requirePermissions([PERMISSIONS.LEADS_VIEW_ALL])(req);
if (permissionError) return permissionError;
```

**Routes requiring permission checks:**

| Route Pattern | Required Permissions |
|--------------|---------------------|
| `/api/leads/*` | `LEADS_VIEW_*`, `LEADS_CREATE`, `LEADS_EDIT_*`, `LEADS_DELETE` |
| `/api/cases/*` | `CASES_VIEW_*`, `CASES_CREATE`, `CASES_EDIT_*`, `CASES_ASSIGN` |
| `/api/documents/*` | `DOCUMENTS_VIEW`, `DOCUMENTS_UPLOAD`, `DOCUMENTS_DELETE` |
| `/api/email/*` | `EMAIL_VIEW`, `EMAIL_SEND`, `EMAIL_MANAGE_TEMPLATES` |
| `/api/users/*` | `USERS_MANAGE` |
| `/api/roles/*` | `ROLES_MANAGE` |
| `/api/workflows/*` | `WORKFLOWS_MANAGE` |
| `/api/reports/*` | `REPORTS_VIEW_*`, `REPORTS_CREATE` |

#### 4.2 Add Record-Level Filtering

Apply `getRecordLevelFilter()` to queries in:

- `file:app/api/leads/route.ts` (already implemented ✓)
- `file:app/api/cases/route.ts` (already implemented ✓)
- All other resource routes that need record-level access control

### 5. Add Session Validation Middleware

**Objective**: Create reusable middleware for consistent authentication and logging.

#### 5.1 Create Middleware Wrapper

Create `file:lib/middleware/auth-middleware.ts`:

```typescript
// Middleware that combines authentication, logging, and rate limiting
export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, session: Session) => Promise<NextResponse>
): Promise<NextResponse>
```

This middleware should:
- Call `getSession()` and return 401 if null
- Call `logRequest()` from `file:lib/middleware/request-logger.ts`
- Apply rate limiting via `rateLimitMiddleware()`
- Pass validated session to handler function

#### 5.2 Apply Middleware to Routes

Refactor API routes to use the new middleware wrapper for cleaner code and consistency.

### 6. Fix Server Actions Authentication

**Objective**: Ensure all server actions properly validate sessions.

#### 6.1 Update Server Actions

Verify these server actions call `getSession()` or `requireAuth()`:

- `file:app/actions/auth.ts` - Already uses `getSession()` ✓
- `file:app/actions/user.ts` - Add `requireAuth()` checks
- `file:app/actions/tenant.ts` - Add `requireAuth()` checks
- `file:app/actions/roles.ts` - Add `requireAuth()` checks
- `file:app/actions/permissions.ts` - Add `requireAuth()` checks
- `file:app/actions/audit.ts` - Add `requireAuth()` checks

**Pattern to apply:**
```typescript
const session = await requireAuth();
// or for role-specific actions:
const session = await requireRole(['ADMIN', 'MANAGER']);
```

### 7. Implement JWT Token Security Best Practices

**Objective**: Enhance JWT token security and rotation.

#### 7.1 Update JWT Configuration in lib/auth.ts

- Ensure `JWT_SECRET` is loaded from environment variable (already done ✓)
- Add token rotation on privilege escalation
- Implement token blacklist for immediate invalidation
- Add CSRF token validation for state-changing operations

#### 7.2 Add Token Refresh Mechanism

- Implement sliding session expiration
- Add refresh token support for long-lived sessions with "Remember Me"
- Rotate tokens periodically for active sessions

### 8. Add HTTP-Only Cookie Security

**Objective**: Ensure cookies are properly secured.

#### 8.1 Verify Cookie Settings in lib/auth.ts

In `createSession()` function, ensure cookies have:
- `httpOnly: true` ✓ (already set)
- `secure: true` in production ✓ (already set)
- `sameSite: 'lax'` ✓ (already set)
- Add `domain` attribute for subdomain support (if needed)

#### 8.2 Add Cookie Integrity Checks

- Implement cookie signature verification
- Add cookie tampering detection
- Log suspicious cookie manipulation attempts

### 9. Implement Logout Flow Properly

**Objective**: Ensure complete session cleanup on logout.

#### 9.1 Update Logout Implementation

Verify `file:app/api/auth/logout/route.ts`:
- Calls `invalidateSession()` ✓ (already done)
- Clears session cookie ✓ (done in `invalidateSession()`)
- Invalidates all related tokens
- Logs logout event in audit log

#### 9.2 Update Frontend Logout

Ensure `file:app/context/UserContext.tsx` `logout()`:
- Calls `logoutAction()` ✓ (already done)
- Clears local state ✓ (already done)
- Redirects to login page
- Clears any cached data

### 10. Add Session Monitoring and Audit Logging

**Objective**: Track authentication events for security monitoring.

#### 10.1 Enhance Audit Logging

Update `file:lib/middleware/request-logger.ts`:
- Log all authentication attempts (success and failure)
- Log session creation and invalidation
- Log permission denials
- Include IP address and user agent

#### 10.2 Add Security Event Monitoring

Create alerts for:
- Multiple failed login attempts
- Account lockouts
- Unusual session patterns
- Permission escalation attempts

### 11. Test Authentication Flow End-to-End

**Objective**: Verify complete authentication system works correctly.

#### 11.1 Test Scenarios

| Scenario | Expected Behavior |
|----------|------------------|
| Password login | Creates session, sets cookie, returns user data |
| SSO login | Calls `loginWithSSO()`, creates session |
| MFA login | Requires code verification before session creation |
| Invalid credentials | Returns 401, increments failed attempts |
| Account lockout | Returns 423, prevents login |
| Session expiry | Returns 401, requires re-login |
| Logout | Invalidates session, clears cookie |
| Protected API access | Returns 401 without valid session |
| Permission check | Returns 403 without required permission |

#### 11.2 Create Test Suite

Add tests in `file:tests/api/`:
- Authentication flow tests
- Session management tests
- Permission enforcement tests
- MFA flow tests

### 12. Documentation and Environment Configuration

**Objective**: Document authentication system and required configuration.

#### 12.1 Update Environment Variables

Ensure `.env.example` includes:
```
JWT_SECRET=your-secret-key-change-in-production
SESSION_EXPIRY_DAYS=7
REMEMBER_ME_EXPIRY_DAYS=30
PASSWORD_MIN_LENGTH=12
PASSWORD_EXPIRY_DAYS=90
PASSWORD_HISTORY_COUNT=5
MAX_FAILED_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
```

#### 12.2 Update Documentation

Update `file:README.md` and `file:docs/api-documentation.md`:
- Authentication flow diagram
- Session management explanation
- API authentication requirements
- MFA setup instructions
- SSO configuration guide