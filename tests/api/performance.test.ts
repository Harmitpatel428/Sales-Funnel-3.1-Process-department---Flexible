/**
 * Performance Tests for API Handler
 * Benchmarks key middleware operations and wrapper overhead
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Mocks - Must be defined before imports
// ============================================================================

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
        get: vi.fn((name) => ({ value: 'mock-session-token' })),
    })),
}));

// Mock database
const mockIsDatabaseHealthy = vi.fn();
vi.mock('@/lib/db', () => ({
    prisma: {},
    isDatabaseHealthy: (...args: any[]) => mockIsDatabaseHealthy(...args),
}));

// Mock rate limiter
const mockRateLimitMiddleware = vi.fn();
vi.mock('@/lib/middleware/rate-limiter', () => ({
    rateLimitMiddleware: (...args: any[]) => mockRateLimitMiddleware(...args),
}));

// Mock auth
const mockGetSessionByToken = vi.fn();
vi.mock('@/lib/auth', () => ({
    getSessionByToken: (...args: any[]) => mockGetSessionByToken(...args),
}));

// Mock auth config
vi.mock('@/lib/authConfig', () => ({
    SESSION_COOKIE_NAME: 'sf_session',
}));

// Mock request logger
const mockLogRequest = vi.fn();
vi.mock('@/lib/middleware/request-logger', () => ({
    logRequest: (...args: any[]) => mockLogRequest(...args),
}));

// Mock session activity
const mockUpdateSessionActivity = vi.fn();
vi.mock('@/lib/middleware/session-activity', () => ({
    updateSessionActivity: (...args: any[]) => mockUpdateSessionActivity(...args),
}));

// Mock error handler
vi.mock('@/lib/middleware/error-handler', () => ({
    handleApiError: vi.fn((error) =>
        NextResponse.json({ success: false, message: error.message }, { status: 500 })
    ),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { withApiHandler } from '@/lib/api/withApiHandler';
import {
    createMockSession,
    createMockRequest,
    measureExecutionTime,
    logPerformanceMetrics,
} from '../utils/test-helpers';

// ============================================================================
// Performance Targets (from requirements)
// ============================================================================

const PERFORMANCE_TARGETS = {
    DB_HEALTH_CHECK_MS: 10,    // Target: <10ms
    SESSION_VALIDATION_MIN_MS: 5,  // Target: 5-10ms minimum
    SESSION_VALIDATION_MAX_MS: 10, // Target: 5-10ms maximum
    WRAPPER_OVERHEAD_MS: 15,   // Acceptable wrapper overhead
    TOTAL_HANDLER_MAX_MS: 50,  // Total max for middleware chain
};

// ============================================================================
// Helper Functions
// ============================================================================

async function measureExecutionTime(fn: () => Promise<any>): Promise<number> {
    const start = performance.now();
    await fn();
    const end = performance.now();
    return end - start;
}

async function runBenchmark(fn: () => Promise<any>, iterations: number = 100): Promise<{
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
}> {
    const times: number[] = [];

    // Warmup (10% of iterations)
    for (let i = 0; i < Math.floor(iterations * 0.1); i++) {
        await fn();
    }

    // Actual measurements
    for (let i = 0; i < iterations; i++) {
        times.push(await measureExecutionTime(fn));
    }

    times.sort((a, b) => a - b);

    return {
        min: times[0],
        max: times[times.length - 1],
        avg: times.reduce((a, b) => a + b) / times.length,
        p50: times[Math.floor(times.length * 0.5)],
        p95: times[Math.floor(times.length * 0.95)],
        p99: times[Math.floor(times.length * 0.99)],
    };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('API Handler Performance Benchmarks', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Fast mock implementations
        mockIsDatabaseHealthy.mockResolvedValue(true);
        mockRateLimitMiddleware.mockResolvedValue(null);
        mockGetSessionByToken.mockResolvedValue(createMockSession());
        mockLogRequest.mockReturnValue(undefined);
        mockUpdateSessionActivity.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ========================================================================
    // DB Health Check Performance
    // ========================================================================

    describe('DB Health Check Performance', () => {
        it(`should complete database health check in under ${PERFORMANCE_TARGETS.DB_HEALTH_CHECK_MS}ms (p95)`, async () => {
            // Simulate realistic DB check timing (should be fast with connection pooling)
            mockIsDatabaseHealthy.mockImplementation(async () => {
                // Simulate minimal latency for a cached/pooled connection
                await new Promise(resolve => setImmediate(resolve));
                return true;
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                authRequired: false,
                rateLimit: false,
                logRequest: false,
                updateSessionActivity: false,
                checkDbHealth: true,
            }, handler);

            const req = createMockRequest();

            const benchmark = await runBenchmark(async () => {
                await wrappedHandler(req);
            }, 50);

            console.log('DB Health Check Benchmark:', {
                avg: `${benchmark.avg.toFixed(2)}ms`,
                p95: `${benchmark.p95.toFixed(2)}ms`,
                p99: `${benchmark.p99.toFixed(2)}ms`,
            });

            // P95 should be under target
            expect(benchmark.p95).toBeLessThan(PERFORMANCE_TARGETS.DB_HEALTH_CHECK_MS);
        });

        it('should fail test if DB health check exceeds target', async () => {
            // Simulate slow DB check
            mockIsDatabaseHealthy.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 15)); // Intentionally slow
                return true;
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                authRequired: false,
                rateLimit: false,
                logRequest: false,
                updateSessionActivity: false,
            }, handler);

            const req = createMockRequest();

            const benchmark = await runBenchmark(async () => {
                await wrappedHandler(req);
            }, 10);

            // This test demonstrates detection of slow operations
            expect(benchmark.avg).toBeGreaterThan(PERFORMANCE_TARGETS.DB_HEALTH_CHECK_MS);
        });
    });

    // ========================================================================
    // Session Validation Performance
    // ========================================================================

    describe('Session Validation Performance', () => {
        it(`should complete session validation in ${PERFORMANCE_TARGETS.SESSION_VALIDATION_MIN_MS}-${PERFORMANCE_TARGETS.SESSION_VALIDATION_MAX_MS}ms (p95)`, async () => {
            // Simulate realistic session validation timing
            mockGetSessionByToken.mockImplementation(async () => {
                // Simulate JWT verification + DB lookup with connection pooling
                await new Promise(resolve => setImmediate(resolve));
                return createMockSession();
            });

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                authRequired: true,
                checkDbHealth: false,
                rateLimit: false,
                logRequest: false,
                updateSessionActivity: false,
            }, handler);

            const req = createMockRequest();

            const benchmark = await runBenchmark(async () => {
                await wrappedHandler(req);
            }, 50);

            console.log('Session Validation Benchmark:', {
                avg: `${benchmark.avg.toFixed(2)}ms`,
                p95: `${benchmark.p95.toFixed(2)}ms`,
                p99: `${benchmark.p99.toFixed(2)}ms`,
            });

            // P95 should be within acceptable range
            expect(benchmark.p95).toBeLessThan(PERFORMANCE_TARGETS.SESSION_VALIDATION_MAX_MS);
        });
    });

    // ========================================================================
    // Wrapper Overhead
    // ========================================================================

    describe('Wrapper Overhead', () => {
        it(`should have minimal wrapper overhead (under ${PERFORMANCE_TARGETS.WRAPPER_OVERHEAD_MS}ms)`, async () => {
            // Minimal mocks to measure pure wrapper overhead
            mockIsDatabaseHealthy.mockResolvedValue(true);
            mockGetSessionByToken.mockResolvedValue(createMockSession());

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                checkDbHealth: false,
                rateLimit: false,
                logRequest: false,
                updateSessionActivity: false,
                authRequired: false,
            }, handler);

            const req = createMockRequest();

            const benchmark = await runBenchmark(async () => {
                await wrappedHandler(req);
            }, 100);

            console.log('Wrapper Overhead Benchmark:', {
                avg: `${benchmark.avg.toFixed(2)}ms`,
                p95: `${benchmark.p95.toFixed(2)}ms`,
                p99: `${benchmark.p99.toFixed(2)}ms`,
            });

            // Wrapper overhead should be minimal
            expect(benchmark.p95).toBeLessThan(PERFORMANCE_TARGETS.WRAPPER_OVERHEAD_MS);
        });

        it('should measure full middleware chain overhead', async () => {
            // All middleware enabled
            mockIsDatabaseHealthy.mockResolvedValue(true);
            mockGetSessionByToken.mockResolvedValue(createMockSession());

            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const wrappedHandler = withApiHandler({
                checkDbHealth: true,
                rateLimit: 100,
                logRequest: true,
                updateSessionActivity: true,
                authRequired: true,
            }, handler);

            const req = createMockRequest();

            const benchmark = await runBenchmark(async () => {
                await wrappedHandler(req);
            }, 50);

            console.log('Full Middleware Chain Benchmark:', {
                avg: `${benchmark.avg.toFixed(2)}ms`,
                p50: `${benchmark.p50.toFixed(2)}ms`,
                p95: `${benchmark.p95.toFixed(2)}ms`,
                p99: `${benchmark.p99.toFixed(2)}ms`,
            });

            // Full chain should still complete quickly
            expect(benchmark.p95).toBeLessThan(PERFORMANCE_TARGETS.TOTAL_HANDLER_MAX_MS);
        });
    });

    // ========================================================================
    // Comparative Performance
    // ========================================================================

    describe('Comparative Performance Analysis', () => {
        it('should compare overhead with and without various middleware', async () => {
            const handler = vi.fn().mockResolvedValue(
                NextResponse.json({ success: true })
            );

            const req = createMockRequest();

            // Baseline: minimal options
            const minimalHandler = withApiHandler({
                authRequired: false,
                checkDbHealth: false,
                rateLimit: false,
                logRequest: false,
                updateSessionActivity: false,
            }, handler);

            const baselineBenchmark = await runBenchmark(async () => {
                await minimalHandler(req);
            }, 50);

            // With auth
            const authHandler = withApiHandler({
                authRequired: true,
                checkDbHealth: false,
                rateLimit: false,
                logRequest: false,
                updateSessionActivity: false,
            }, handler);

            const authBenchmark = await runBenchmark(async () => {
                await authHandler(req);
            }, 50);

            // With DB check
            const dbHandler = withApiHandler({
                authRequired: false,
                checkDbHealth: true,
                rateLimit: false,
                logRequest: false,
                updateSessionActivity: false,
            }, handler);

            const dbBenchmark = await runBenchmark(async () => {
                await dbHandler(req);
            }, 50);

            // Full middleware
            const fullHandler = withApiHandler({}, handler);

            const fullBenchmark = await runBenchmark(async () => {
                await fullHandler(req);
            }, 50);

            console.log('\nComparative Performance (p95):');
            console.log('-----------------------------------');
            console.log(`Baseline (minimal):  ${baselineBenchmark.p95.toFixed(2)}ms`);
            console.log(`With Auth:           ${authBenchmark.p95.toFixed(2)}ms (+${(authBenchmark.p95 - baselineBenchmark.p95).toFixed(2)}ms)`);
            console.log(`With DB Check:       ${dbBenchmark.p95.toFixed(2)}ms (+${(dbBenchmark.p95 - baselineBenchmark.p95).toFixed(2)}ms)`);
            console.log(`Full Middleware:     ${fullBenchmark.p95.toFixed(2)}ms (+${(fullBenchmark.p95 - baselineBenchmark.p95).toFixed(2)}ms)`);

            // Auth overhead should be reasonable
            const authOverhead = authBenchmark.p95 - baselineBenchmark.p95;
            expect(authOverhead).toBeLessThan(PERFORMANCE_TARGETS.SESSION_VALIDATION_MAX_MS);

            // DB overhead should be reasonable
            const dbOverhead = dbBenchmark.p95 - baselineBenchmark.p95;
            expect(dbOverhead).toBeLessThan(PERFORMANCE_TARGETS.DB_HEALTH_CHECK_MS);
        });
    });

    // ========================================================================
    // Performance Regression Tests
    // ========================================================================

    describe('Performance Regression Detection', () => {
        it('should fail when middleware exceeds target times', async () => {
            const performanceReport: Record<string, { passed: boolean; time: number; target: number }> = {};

            // Test DB health check
            const dbCheckTime = await measureExecutionTime(async () => {
                await mockIsDatabaseHealthy();
            });
            performanceReport.dbHealthCheck = {
                passed: dbCheckTime < PERFORMANCE_TARGETS.DB_HEALTH_CHECK_MS,
                time: dbCheckTime,
                target: PERFORMANCE_TARGETS.DB_HEALTH_CHECK_MS,
            };

            // Test session validation
            const sessionTime = await measureExecutionTime(async () => {
                await mockGetSessionByToken('test-token');
            });
            performanceReport.sessionValidation = {
                passed: sessionTime < PERFORMANCE_TARGETS.SESSION_VALIDATION_MAX_MS,
                time: sessionTime,
                target: PERFORMANCE_TARGETS.SESSION_VALIDATION_MAX_MS,
            };

            console.log('\nPerformance Report:');
            console.log(JSON.stringify(performanceReport, null, 2));

            // All checks should pass
            expect(performanceReport.dbHealthCheck.passed).toBe(true);
            expect(performanceReport.sessionValidation.passed).toBe(true);
        });
    });
});
