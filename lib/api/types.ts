import { NextRequest, NextResponse } from "next/server";
import { Session } from "next-auth";

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
     * Whether to use NextAuth v5 auth() for SSO routes
     * @default false
     */
    useNextAuth?: boolean;

    /**
     * Whether to use API key authentication instead of session auth
     * @default false
     */
    useApiKeyAuth?: boolean;

    /**
     * Required scopes for API key authentication
     * Only used when useApiKeyAuth is true
     */
    requiredScopes?: string[];

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
}

/**
 * Session data from custom auth system
 */
export interface CustomSessionData {
    userId: string;
    role: string;
    sessionId: string;
    tenantId: string;
}

/**
 * API key authentication context
 */
export interface ApiKeyAuthContext {
    /** The validated API key record */
    apiKey: any;
    /** The tenant associated with the API key */
    tenant: any;
    /** Scopes granted to the API key */
    scopes: string[];
}

/**
 * Context passed to API handlers
 */
export interface ApiContext {
    /**
     * Session data from custom auth (if authRequired: true && !useNextAuth)
     */
    session: CustomSessionData | null;

    /**
     * NextAuth v5 session (if useNextAuth: true)
     */
    nextAuthSession: Session | null;

    /**
     * API key auth context (if useApiKeyAuth: true)
     */
    apiKeyAuth: ApiKeyAuthContext | null;

    /**
     * Original request object
     */
    req: NextRequest;

    /**
     * Request start timestamp for duration tracking
     */
    /**
     * Request start timestamp for duration tracking
     */
    startTime: number;

    /**
     * Route parameters for dynamic routes
     */
    params?: any;
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
