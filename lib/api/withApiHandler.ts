import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { isDatabaseHealthy } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/middleware/rate-limiter";
import { logRequest } from "@/lib/middleware/request-logger";
import { updateSessionActivity } from "@/lib/middleware/session-activity";
import { handleApiError } from "@/lib/middleware/error-handler";
import { apiKeyAuthMiddleware } from "@/lib/middleware/api-key-auth";
import { logApiUsage } from "@/lib/api-keys";
import { checkApiKeyRateLimit, addRateLimitHeaders } from "@/lib/api-rate-limiter";
import { getSessionByToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/authConfig";

import { unauthorizedResponse, serviceUnavailableResponse } from "./response-helpers";
import { ApiHandler, ApiHandlerOptions, ApiContext, CustomSessionData } from "./types";

// Re-exports
export * from "./response-helpers";
export * from "./types";
export { NetworkError, ValidationError, AuthError, ConflictError, ServerError } from "@/lib/middleware/error-handler";

const DEFAULT_OPTIONS: ApiHandlerOptions = {
    authRequired: true,
    checkDbHealth: true,
    rateLimit: 100,
    logRequest: true,
    updateSessionActivity: true,
    useApiKeyAuth: false,
    requiredScopes: undefined,
};

/**
 * Get the custom session token from cookies.
 */
async function getSessionTokenFromCookie(): Promise<string | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return token || null;
}

/**
 * Validate response format (fire-and-forget).
 * Logs a warning if JSON responses are missing the 'success' field.
 */
async function validateResponseFormat(response: NextResponse): Promise<void> {
    try {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            const clone = response.clone();
            const body = await clone.json();
            if (typeof body === 'object' && body !== null && !('success' in body)) {
                console.warn('[API] Response missing "success" field:', Object.keys(body).slice(0, 5));
            }
        }
    } catch {
        // Ignore validation errors - response may not be JSON
    }
}

/**
 * Build the API context object
 */
function buildApiContext(
    req: NextRequest,
    session: CustomSessionData | null,
    startTime: number,
    params?: any,
    apiKeyAuth?: ApiContext['apiKeyAuth']
): ApiContext {
    return {
        req,
        session,
        startTime,
        params,
        apiKeyAuth: apiKeyAuth ?? null,
    };
}

/**
 * Higher-Order Function wrapper for API routes
 * Composes middleware for DB health, rate limiting, auth, logging, and error handling.
 */
export function withApiHandler(
    options: Partial<ApiHandlerOptions>,
    handler: ApiHandler
): (req: NextRequest, ...args: any[]) => Promise<NextResponse> {
    const config = { ...DEFAULT_OPTIONS, ...options };

    return async (req: NextRequest, ...args: any[]) => {
        const startTime = Date.now();
        let session: CustomSessionData | null = null;
        let apiKeyAuth: ApiContext['apiKeyAuth'] = null;
        let rateLimitResult: { allowed: boolean; limit: number; remaining: number; reset: number; retryAfter?: number } | null = null;

        // Extract route context (params)
        const routeContext = args[0] || {};
        const params = routeContext.params;

        try {
            // Phase 1: Pre-flight Checks (Trailing slash guard)
            const { pathname } = new URL(req.url);
            if (pathname.endsWith('/') && pathname !== '/api/leads/' && pathname !== '/api/cases/') {
                // Do nothing — handler must process request normally
            }

            // Phase 2: Database Health Check
            if (config.checkDbHealth) {
                if (!(await isDatabaseHealthy())) {
                    return serviceUnavailableResponse();
                }
            }

            // Phase 3: Rate Limiting (for session-based auth)
            if (config.rateLimit !== false && !config.useApiKeyAuth) {
                const rateLimitError = await rateLimitMiddleware(req, config.rateLimit);
                if (rateLimitError) return rateLimitError;
            }

            // Phase 4: Authentication
            if (config.useApiKeyAuth) {
                // API Key Authentication Path
                const apiKeyResult = await apiKeyAuthMiddleware(req, config.requiredScopes);

                // If apiKeyResult is a NextResponse, it's an error response
                if (apiKeyResult instanceof NextResponse) {
                    return apiKeyResult;
                }

                // Otherwise, it's the successful auth data
                apiKeyAuth = apiKeyResult;

                // Check API key specific rate limit
                const rlResult = await checkApiKeyRateLimit(apiKeyAuth.apiKey.id, apiKeyAuth.apiKey.rateLimit);
                if (!rlResult.allowed) {
                    return NextResponse.json(
                        { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded', retryAfter: rlResult.retryAfter } },
                        { status: 429 }
                    );
                }
                rateLimitResult = rlResult;
            } else if (config.authRequired) {
                // Session Authentication Path (custom session auth only)
                const token = await getSessionTokenFromCookie();
                if (token) {
                    session = await getSessionByToken(token);
                }
                if (!session) {
                    return unauthorizedResponse();
                }
            }

            // Phase 4.5: Permission Check (Declarative)
            if (config.permissions && config.permissions.length > 0) {
                const { requirePermissions } = await import("@/lib/middleware/permissions");

                // For API Key auth, permissions are handled by requiredScopes in Phase 4.
                // This declarative check applies to session-based auth.
                if (session) {
                    const permissionError = await requirePermissions(
                        config.permissions as any,
                        config.requireAll ?? true,
                        {
                            userId: session.userId,
                            tenantId: session.tenantId,
                            endpoint: pathname
                        }
                    )(req);

                    if (permissionError) return permissionError;
                }
            }

            // Phase 4.6: Tenant Context Validation
            // Skip for routes that explicitly opt out (OAuth, auth routes)
            if (!config.skipTenantCheck && config.authRequired && !config.useApiKeyAuth) {
                if (session && !session.tenantId) {
                    console.warn(`[API] Tenant context missing for authenticated route: ${pathname}`);
                    return NextResponse.json(
                        {
                            success: false,
                            error: 'FORBIDDEN',
                            message: 'Tenant context is required for this operation'
                        },
                        { status: 403 }
                    );
                }
            }

            // Phase 5: Request Logging
            if (config.logRequest) {
                // Pass the unified session data directly
                logRequest(req, session || null);
            }

            // Phase 6: Session Activity Update (only for session-based auth)
            if (config.updateSessionActivity && session && !config.useApiKeyAuth) {
                // Fire-and-forget
                updateSessionActivity(req).catch((err) => {
                    console.error("[SessionActivity] Failed to update activity:", err);
                });
            }

            // Phase 7: Handler Execution
            const context = buildApiContext(req, session, startTime, params, apiKeyAuth);
            // Handler receives (req, context) for backward compatibility
            const response = await handler(req, context);

            // Phase 8: Response Finalization
            let finalResponse = response;

            // Add rate limit headers for API key auth
            if (config.useApiKeyAuth && apiKeyAuth && rateLimitResult) {
                finalResponse = addRateLimitHeaders(response, rateLimitResult);
            }

            // Validate response format (fire-and-forget)
            validateResponseFormat(finalResponse).catch(() => {
                // Ignore validation errors
            });

            // Log success
            if (config.logRequest) {
                logRequest(req, session || null, { startTime, status: finalResponse.status });
            }

            // Log API usage for API key auth (fire-and-forget)
            if (config.useApiKeyAuth && apiKeyAuth) {
                const { pathname } = new URL(req.url);
                const responseTime = Date.now() - startTime;
                const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
                const userAgent = req.headers.get('user-agent') || 'unknown';

                logApiUsage(
                    apiKeyAuth.apiKey.id,
                    pathname,
                    req.method,
                    finalResponse.status,
                    responseTime,
                    ipAddress,
                    userAgent
                ).catch((err) => {
                    console.error("[ApiUsage] Failed to log API usage:", err);
                });
            }

            return finalResponse;

        } catch (error) {
            // Phase 9: Error Handling
            if (config.logRequest) {
                logRequest(req, session || null, {
                    error: error instanceof Error ? error.message : "Unknown error",
                    level: 'ERROR'
                });
            }
            return handleApiError(error);
        }
    };
}
