import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, logApiUsage } from '../api-keys';
import { checkApiKeyRateLimit, addRateLimitHeaders } from '../api-rate-limiter';

export interface ApiKeyAuthResult {
    apiKey: any;
    tenant: any;
    scopes: string[];
}

export async function apiKeyAuthMiddleware(
    req: NextRequest,
    requiredScopes?: string[]
): Promise<NextResponse | ApiKeyAuthResult> {
    const startTime = Date.now();
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');

    if (!apiKey) {
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'API key required. Provide it via X-API-Key header or Bearer token.',
                }
            },
            { status: 401 }
        );
    }

    const validation = await validateApiKey(apiKey);

    if (!validation.valid) {
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'INVALID_API_KEY',
                    message: 'Invalid or expired API key',
                }
            },
            { status: 401 }
        );
    }

    // Check rate limit using Redis-backed limiter
    const rateLimitResult = await checkApiKeyRateLimit(
        validation.apiKey.id,
        validation.apiKey.rateLimit
    );

    if (!rateLimitResult.allowed) {
        const responseTime = Date.now() - startTime;
        // Log the rate-limited request
        logApiUsage(
            validation.apiKey.id,
            req.nextUrl.pathname,
            req.method,
            429,
            responseTime,
            req.headers.get('x-forwarded-for') || undefined,
            req.headers.get('user-agent') || undefined
        ).catch(console.error);

        const errorResponse = NextResponse.json(
            {
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Rate limit exceeded. Please slow down your requests.',
                    retryAfter: rateLimitResult.retryAfter,
                }
            },
            { status: 429 }
        );

        return addRateLimitHeaders(errorResponse, rateLimitResult);
    }

    // Check scopes
    if (requiredScopes && requiredScopes.length > 0) {
        const hasAllScopes = requiredScopes.every(scope =>
            validation.scopes?.includes(scope) || validation.scopes?.includes('admin')
        );

        if (!hasAllScopes) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: `Insufficient API key permissions. Required scopes: ${requiredScopes.join(', ')}`,
                    }
                },
                { status: 403 }
            );
        }
    }

    return {
        apiKey: validation.apiKey,
        tenant: validation.tenant,
        scopes: validation.scopes || [],
    };
}

/**
 * Higher-order function to wrap API route handlers with API key authentication
 */
export function withApiKeyAuth(
    handler: (req: NextRequest, auth: ApiKeyAuthResult) => Promise<NextResponse>,
    requiredScopes?: string[]
) {
    return async (req: NextRequest): Promise<NextResponse> => {
        const startTime = Date.now();
        const authResult = await apiKeyAuthMiddleware(req, requiredScopes);

        // If authResult is a NextResponse, it means authentication failed
        if (authResult instanceof NextResponse) {
            return authResult;
        }

        // Call the handler with auth context
        let response: NextResponse;
        let statusCode = 200;

        try {
            response = await handler(req, authResult);
            statusCode = response.status;
        } catch (error: any) {
            statusCode = 500;
            response = NextResponse.json(
                {
                    success: false,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'An internal error occurred',
                    }
                },
                { status: 500 }
            );
        }

        // Log usage asynchronously
        const responseTime = Date.now() - startTime;
        logApiUsage(
            authResult.apiKey.id,
            req.nextUrl.pathname,
            req.method,
            statusCode,
            responseTime,
            req.headers.get('x-forwarded-for') || undefined,
            req.headers.get('user-agent') || undefined
        ).catch(console.error);

        // Add rate limit headers
        response.headers.set('X-RateLimit-Limit', authResult.apiKey.rateLimit.toString());

        return response;
    };
}

/**
 * Check if the API key has a specific scope
 */
export function hasScope(scopes: string[], requiredScope: string): boolean {
    return scopes.includes(requiredScope) || scopes.includes('admin');
}

/**
 * Check if the API key has any of the specified scopes
 */
export function hasAnyScope(scopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.some(scope => hasScope(scopes, scope));
}
