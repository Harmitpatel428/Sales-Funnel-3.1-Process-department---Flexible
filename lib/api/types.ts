import { NextRequest, NextResponse } from "next/server";

/**
 * Configuration options for the API handler wrapper
 */
export interface ApiHandlerOptions {
    /**
     * Whether session authentication is required
     * @default true
     */
    authRequired?: boolean;

    /**
     * Whether to perform DB health check
     * @default true
     */
    checkDbHealth?: boolean;

    /**
     * Rate limit per minute, or false to disable
     * @default 100
     */
    rateLimit?: number | false;

    /**
     * Whether to log the request
     * @default true
     */
    logRequest?: boolean;

    /**
     * Whether to update session activity
     * @default true
     */
    updateSessionActivity?: boolean;

    /**
     * Whether to skip tenant validation.
     * Set to true for auth routes that operate outside tenant context
     * (login, logout, password reset, OAuth, etc.)
     * @default false
     */
    skipTenantCheck?: boolean;

    /**
     * Whether to use API key authentication instead of session auth.
     * When true, expects X-API-Key header and validates via apiKeyAuthMiddleware.
     * @default false
     */
    useApiKeyAuth?: boolean;

    /**
     * Required scopes for API key authentication.
     * Only used when useApiKeyAuth is true.
     * @default undefined (no specific scopes required)
     */
    requiredScopes?: string[];

    /**
     * Required permissions for session-based authentication.
     * Maps to PERMISSIONS constants from app/types/permissions.ts.
     * @default undefined (no specific permissions required)
     */
    permissions?: string[];

    /**
     * Whether all listed permissions are required (true) or just any (false).
     * Only used when permissions array is provided.
     * @default true
     */
    requireAll?: boolean;
}

/**
 * Session data from custom auth system.
 */
export interface CustomSessionData {
    userId: string;
    role: string;
    sessionId: string;
    /**
     * Tenant ID for multi-tenant isolation.
     * May be undefined for auth routes (login, logout) where tenant context
     * is not yet established. Use skipTenantCheck: true for such routes.
     */
    tenantId?: string;
}

/**
 * Context passed to API handlers.
 */
export interface ApiContext {
    /**
     * Session data from custom session authentication.
     * Will be null if authRequired: false or authentication failed.
     */
    session: CustomSessionData | null;

    /**
     * Original request object
     */
    req: NextRequest;

    /**
     * Request start timestamp for duration tracking
     */
    startTime: number;

    /**
     * Route parameters for dynamic routes
     */
    params?: any;

    /**
     * API key authentication data when useApiKeyAuth is true.
     * Contains validated API key, tenant, and scopes.
     */
    apiKeyAuth?: {
        apiKey: {
            id: string;
            name: string;
            tenantId: string;
            scopes: string[];
            rateLimit: number;
            expiresAt: Date | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        tenant: {
            id: string;
            name?: string;
        };
        scopes: string[];
    } | null;
}

/**
 * API Handler function signature
 */
export type ApiHandler = (req: NextRequest, context: ApiContext) => Promise<NextResponse>;

/**
 * Standardized error response structure
 */
export interface ApiErrorResponse {
    success: false;
    error: string;
    message: string;
    errors?: Array<{ field: string; message: string; code: string }>;
}
