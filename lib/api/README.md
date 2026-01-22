# Standardized API Handler Wrapper

This directory contains the standardized Higher-Order Function (HOF) wrapper `withApiHandler` and associated utilities for building robust API routes in the Sales Funnel application.

## Overview

The `withApiHandler` wrapper composes common middleware functionality into a consistent pipeline, reducing boilerplate and ensuring consistent behavior across all API endpoints.

It handles:
- Database Health Checks
- Rate Limiting
- Authentication (Custom Session & NextAuth v5)
- Request Logging
- Session Activity Tracking
- Error Handling
- Response Formatting

## Architecture

The wrapper executes middleware in a specific order:

1. **Pre-flight Checks**: Records start time and handles trailing slash guards.
2. **Database Health**: Checks if the database is accessible (returns 503 if not).
3. **Rate Limiting**: Enforces rate limits (returns 429 if exceeded).
4. **Authentication**: Validates session (returns 401 if missing/invalid).
5. **Request Logging**: Logs the incoming request with session context.
6. **Session Activity**: Updates session last active timestamp (fire-and-forget).
7. **Handler Execution**: Executes the route handler logic.
8. **Error Handling**: Catches logic errors and formats them (500, 400, etc.).
9. **Response Finalization**: Logs successful response with duration.

## Usage

### Basic Protected Route

```typescript
import { withApiHandler, successResponse } from '@/lib/api/withApiHandler';

export const GET = withApiHandler(async ({ session, req }) => {
  // session is guaranteed to be present
  const data = await fetchData(session.tenantId);
  return successResponse(data);
});
```

### Public Route (No Auth)

```typescript
export const POST = withApiHandler(
  async ({ req }) => {
    const data = await processPublicRequest(req);
    return successResponse(data);
  },
  { authRequired: false }
);
```

### SSO Route (NextAuth)

```typescript
export const GET = withApiHandler(
  async ({ nextAuthSession }) => {
    // Uses NextAuth v5 session
    return successResponse({ user: nextAuthSession?.user });
  },
  { useNextAuth: true }
);
```

### Custom Rate Limit

```typescript
export const POST = withApiHandler(
  async ({ req }) => {
    // ...
  },
  { rateLimit: 30 } // 30 requests per minute
);
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authRequired` | `boolean` | `true` | Whether session authentication is required |
| `checkDbHealth` | `boolean` | `true` | Whether to perform DB health check |
| `rateLimit` | `number \| false` | `100` | Rate limit per minute, or false to disable |
| `useNextAuth` | `boolean` | `false` | Whether to use NextAuth v5 for SSO routes |
| `logRequest` | `boolean` | `true` | Whether to log the request |
| `updateSessionActivity` | `boolean` | `true` | Whether to update session activity |

## Migration Guide

To migrate an existing route:

1. Import `withApiHandler` and remove manual middleware imports.
2. Wrap your handler function.
3. Remove manual DB, rate limit, auth, and error handling logic.
4. Use `session` from the context object instead of extracting it manually.
5. Use response helpers (`successResponse`, `errorResponse`, etc.) provided by the wrapper.

**Before:**
```typescript
export async function GET(req: NextRequest) {
  try {
    if (!await isDatabaseHealthy()) return errorResponse('Service unavailable', 503);
    const session = await getSession();
    if (!session) return unauthorizedResponse();
    // ... logic
  } catch (error) {
    return handleApiError(error);
  }
}
```

**After:**
```typescript
export const GET = withApiHandler(async ({ session }) => {
  // ... logic
});
```
