import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Session } from "next-auth";

import { isDatabaseHealthy } from "@/lib/db";
import { rateLimitMiddleware } from "@/lib/middleware/rate-limiter";
import { getSessionByToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/authConfig";
import { logRequest } from "@/lib/middleware/request-logger";
import { updateSessionActivity } from "@/lib/middleware/session-activity";
import { handleApiError } from "@/lib/middleware/error-handler";
import { apiKeyAuthMiddleware, ApiKeyAuthResult } from "@/lib/middleware/api-key-auth";
import { logApiUsage } from "@/lib/api-keys";

import { unauthorizedResponse, serviceUnavailableResponse } from "./response-helpers";
import { ApiHandler, ApiHandlerOptions, ApiContext, CustomSessionData, ApiKeyAuthContext } from "./types";

// Re-exports
export * from "./response-helpers";
export * from "./types";
export { NetworkError, ValidationError, AuthError, ConflictError, ServerError } from "@/lib/middleware/error-handler";

const DEFAULT_OPTIONS: ApiHandlerOptions = {
    authRequired: true,
    checkDbHealth: true,
    rateLimit: 100,
    useNextAuth: false,
    useApiKeyAuth: false,
    logRequest: true,
    updateSessionActivity: true,
};

/**
 * Helper to get custom session from cookies
 */
async function getCustomSession(req: NextRequest): Promise<CustomSessionData | null> {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) return null;
    return getSessionByToken(sessionToken);
}

/**
 * Helper to get NextAuth session
 */
async function getNextAuthSession(): Promise<Session | null> {
    const { auth } = await import("@/app/api/auth/[...nextauth]/route");
    return await auth();
}

/**
 * Build the API context object
 */
function buildApiContext(
    req: NextRequest,
    session: CustomSessionData | null,
    nextAuthSession: Session | null,
    apiKeyAuth: ApiKeyAuthContext | null,
    startTime: number,
    params?: any
): ApiContext {
    return {
        req,
        session,
        nextAuthSession,
        apiKeyAuth,
        startTime,
        params,
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
        let nextAuthSession: Session | null = null;
        let apiKeyAuth: ApiKeyAuthContext | null = null;

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

            // Phase 3: Rate Limiting
            if (config.rateLimit !== false) {
                const rateLimitError = await rateLimitMiddleware(req, config.rateLimit);
                if (rateLimitError) return rateLimitError;
            }

            // Phase 4: Authentication
            if (config.authRequired) {
                if (config.useApiKeyAuth) {
                    // API Key Auth Path
                    const authResult = await apiKeyAuthMiddleware(req, config.requiredScopes);
                    if (authResult instanceof NextResponse) {
                        return authResult; // Auth failed
                    }
                    apiKeyAuth = authResult as ApiKeyAuthContext;
                } else if (config.useNextAuth) {
                    // NextAuth v5 Path
                    nextAuthSession = await getNextAuthSession();
                    if (!nextAuthSession) {
                        return unauthorizedResponse();
                    }
                } else {
                    // Custom Session Auth Path (Default)
                    session = await getCustomSession(req);
                    if (!session) {
                        return unauthorizedResponse();
                    }
                }
            }

            // Phase 5: Request Logging
            if (config.logRequest) {
                // Pass the appropriate session data (preferring custom session if both exist, which is unlikely)
                logRequest(req, session || (nextAuthSession?.user as any) || null);
            }

            // Phase 6: Session Activity Update
            if (config.updateSessionActivity && session && !config.useNextAuth && !config.useApiKeyAuth) {
                // Fire-and-forget
                updateSessionActivity(req).catch((err) => {
                    console.error("[SessionActivity] Failed to update activity:", err);
                });
            }

            // Phase 7: Handler Execution
            const context = buildApiContext(req, session, nextAuthSession, apiKeyAuth, startTime, params);
            const response = await handler(req, context);

            // Phase 9: Response Finalization (Log Success)
            // Note: We log success here. If handler throws, it goes to catch block.
            if (config.logRequest) {
                logRequest(req, session || (nextAuthSession?.user as any) || null, { startTime, status: response.status });
            }

            // Log API key usage if applicable
            if (apiKeyAuth) {
                const responseTime = Date.now() - startTime;
                logApiUsage(
                    apiKeyAuth.apiKey.id,
                    req.nextUrl.pathname,
                    req.method,
                    response.status,
                    responseTime,
                    req.headers.get('x-forwarded-for') || undefined,
                    req.headers.get('user-agent') || undefined
                ).catch(console.error);

                // Add rate-limit headers for API key authenticated requests
                response.headers.set('X-RateLimit-Limit', String(apiKeyAuth.apiKey.rateLimit));
            }

            return response;

        } catch (error) {
            // Phase 8: Error Handling
            if (config.logRequest) {
                logRequest(req, session || (nextAuthSession?.user as any) || null, {
                    error: error instanceof Error ? error.message : "Unknown error",
                    level: 'ERROR'
                });
            }
            return handleApiError(error);
        }
    };
}
