# API Test Suite

This document provides an overview of the testing strategy and guidelines for the API infrastructure.

## Overview

The test suite follows a three-layer testing approach:

1. **Unit Tests** - Test individual components in isolation with mocked dependencies
2. **Integration Tests** - Test components working together with real route handlers
3. **E2E Tests** - Test complete user flows through the API

## Running Tests

### Unit & Integration Tests (Vitest)

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode
npm run test:e2e:ui

# Run with debug mode
npm run test:e2e:debug

# Run auth-related E2E tests
npm run test:e2e:auth

# Run API-related E2E tests
npm run test:e2e:api
```

## Test Structure

```
tests/
├── api/
│   ├── withApiHandler.test.ts    # Unit tests for HOF wrapper
│   ├── response-helpers.test.ts  # Unit tests for response functions
│   ├── error-responses.test.ts   # Integration tests for error handling
│   ├── api-key-auth.test.ts      # Integration tests for API key auth
│   ├── leads.test.ts             # API route tests
│   └── public-api.test.ts        # Public API tests
├── utils/
│   └── test-helpers.ts           # Reusable test utilities
└── validation.test.ts            # Validation tests

e2e/
├── fixtures/
│   ├── auth-helpers.ts           # E2E auth utilities
│   └── test-data.ts              # Test data fixtures
├── api-validation.spec.ts        # API validation and auth flow tests
├── leads-api.spec.ts             # Leads API E2E tests
├── documents-api.spec.ts         # Documents API E2E tests
└── auth.spec.ts                  # Authentication E2E tests
```

## Writing Tests

### Unit Tests for API Handlers

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withApiHandler } from '@/lib/api/withApiHandler';
import { createMockRequest, createMockSession } from '../utils/test-helpers';

describe('MyHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup mocks
    });

    it('should handle request correctly', async () => {
        const handler = vi.fn().mockResolvedValue(
            NextResponse.json({ success: true })
        );
        
        const wrappedHandler = withApiHandler({}, handler);
        const req = createMockRequest();
        const response = await wrappedHandler(req);
        
        expect(response.status).toBe(200);
    });
});
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin, authenticatedRequest } from './fixtures/auth-helpers';

test.describe('My API Tests', () => {
    let sessionCookie: string;

    test.beforeAll(async ({ request }) => {
        sessionCookie = await loginAsAdmin(request);
    });

    test('should access protected endpoint', async ({ request }) => {
        const response = await authenticatedRequest(
            request, 'GET', '/api/endpoint', sessionCookie
        );
        expect(response.status()).toBe(200);
    });
});
```

## Mocking Strategy

### When to Mock

- **Database calls** - Always mock `prisma` to avoid test database dependencies
- **External services** - Mock email, file storage, third-party APIs
- **Authentication** - Mock `getSessionByToken`, `cookies()` for unit tests
- **Middleware** - Mock `rateLimitMiddleware`, `isDatabaseHealthy` for isolation

### When NOT to Mock

- **E2E tests** - Use real endpoints with test database
- **Response helpers** - Test actual response formatting
- **Validation logic** - Test real Zod schemas

### Common Mocks

```typescript
// Mock database health
vi.mock('@/lib/db', () => ({
    prisma: {},
    isDatabaseHealthy: vi.fn().mockResolvedValue(true),
}));

// Mock session
vi.mock('@/lib/auth', () => ({
    getSessionByToken: vi.fn().mockResolvedValue({
        userId: 'user-123',
        role: 'ADMIN',
        tenantId: 'tenant-123',
    }),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
        get: vi.fn(() => ({ value: 'mock-token' })),
    })),
}));
```

## Test Coverage

### Coverage Requirements

| Component | Target | Priority |
|-----------|--------|----------|
| `withApiHandler` | 95% | Critical |
| Response Helpers | 100% | Critical |
| Error Handler | 90% | High |
| Rate Limiter | 85% | High |
| API Key Auth | 90% | High |
| Auth Routes | 85% | High |
| Leads Routes | 80% | Medium |
| Documents Routes | 80% | Medium |

### Checking Coverage

```bash
npm run test:coverage
```

Coverage reports are generated in:
- Console output (text summary)
- `coverage/` folder (HTML report)
- `coverage/coverage-final.json` (JSON for CI)

## CI/CD Integration

Tests run automatically in the CI pipeline:

1. **Unit tests** - Run on every push
2. **Integration tests** - Run on every push
3. **E2E tests** - Run on pull requests to main
4. **Coverage check** - Fails if below 80% threshold

## Troubleshooting

### Common Issues

**"Cannot find module '@/lib/...' "**
- Ensure `tsconfig.json` has proper path aliases
- Run `npm install` to regenerate Prisma client

**"Database health check failed"**
- Check that `isDatabaseHealthy` is properly mocked
- Ensure mock is defined before imports

**"Session not found"**
- Verify `getSessionByToken` mock returns valid session
- Check `cookies()` mock returns session token

**"Rate limit exceeded in tests"**
- Mock `rateLimitMiddleware` to return `null`
- Reset mocks between tests with `vi.clearAllMocks()`

### Debug Tips

1. Use `vi.fn().mockImplementation()` to log mock calls
2. Add `console.log` in mock implementations for debugging
3. Run single test with `npm test -- -t "test name"`
4. Use `--reporter=verbose` for detailed output
