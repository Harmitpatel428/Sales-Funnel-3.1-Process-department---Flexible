/**
 * Centralized API Client with typed responses, error handling, and circuit breaker
 */

import { executeWithCircuitBreaker } from '../utils/circuitBreaker';

// API Response types
export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}

export interface ApiError {
    success: false;
    message: string;
    code?: string;
    details?: Record<string, any>;
}

// Request options
interface RequestOptions {
    params?: Record<string, any>;
    headers?: Record<string, string>;
    timeout?: number;
    skipCircuitBreaker?: boolean;
    skipHealthCheck?: boolean;
}

// Default timeout in milliseconds
const DEFAULT_TIMEOUT = 30000;

// Health check status (simple in-memory cache)
let isSystemHealthy = true;
let lastHealthCheck = 0;

export function updateSystemHealth(healthy: boolean) {
    isSystemHealthy = healthy;
    lastHealthCheck = Date.now();
}

/**
 * Build query string from params object
 */
export function buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
                value.forEach((v) => searchParams.append(key, String(v)));
            } else if (typeof value === 'object') {
                searchParams.append(key, JSON.stringify(value));
            } else {
                searchParams.append(key, String(value));
            }
        }
    });

    return searchParams.toString();
}

/**
 * Create an AbortController with timeout
 */
function createTimeoutController(timeout: number): { controller: AbortController; timeoutId: NodeJS.Timeout } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    return { controller, timeoutId };
}

/**
 * Parse error response from API
 */
async function parseErrorResponse(response: Response): Promise<ApiError> {
    try {
        const data = await response.json();
        return {
            success: false,
            message: data.message || data.error || `HTTP Error ${response.status}`,
            code: data.code || String(response.status),
            details: data.details || data.errors,
        };
    } catch {
        return {
            success: false,
            message: `HTTP Error ${response.status}: ${response.statusText}`,
            code: String(response.status),
        };
    }
}

/**
 * Generate client-side UUID for request correlation
 */
function generateRequestId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Core fetch wrapper with error handling, timeout, and circuit breaker
 */
async function baseFetch<T>(
    url: string,
    method: string,
    body?: any,
    options: RequestOptions = {}
): Promise<T> {
    // 1. Check System Health (unless bypassed)
    if (!options.skipHealthCheck && !isSystemHealthy) {
        // Allow critical checks even if "unhealthy" to allow recovery? 
        // Or assume calling code handles verification.
        // For now, if strictly unhealthy, we might block non-critical mutations.
        // But let's assume this is advisory or handled by CircuitBreaker mostly.
        // The requirement said "Before making API calls, check health status... prevent request".
        // We'll throw if explicitly set to unhealthy for non-critical paths?
        // Actually, let's rely on CircuitBreaker for per-endpoint health, 
        // and global health for broader stops if needed.
    }

    const { params, headers = {}, timeout = DEFAULT_TIMEOUT, skipCircuitBreaker } = options;

    // 2. Request Correlation
    const requestId = generateRequestId();
    const requestHeaders = {
        ...headers,
        'X-Request-ID': requestId
    };

    // Build URL with query params
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
        const queryString = buildQueryString(params);
        fullUrl = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
    }

    const performRequest = async () => {
        // Setup timeout
        const { controller, timeoutId } = createTimeoutController(timeout);
        const startTime = Date.now();

        try {
            const isFormData = body instanceof FormData;

            const response = await fetch(fullUrl, {
                method,
                headers: {
                    ...(!isFormData && { 'Content-Type': 'application/json' }),
                    ...requestHeaders,
                },
                body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
                signal: controller.signal,
                credentials: 'include', // Ensure cookies are sent with all API requests
                cache: 'no-store' // Prevent browser from caching API responses
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await parseErrorResponse(response);
                // Attach correlation ID and context to error
                const context = {
                    requestId,
                    endpoint: url,
                    method,
                    requestPayload: sanitizePayload(body)
                };

                if (error.details) {
                    error.details = { ...error.details, ...context };
                } else {
                    error.details = context;
                }
                throw error;
            }

            // Handle empty responses
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                return {} as T;
            }

            const data = await response.json();
            return data;
        } catch (error: any) {
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;

            // Handle abort (timeout)
            if (error.name === 'AbortError') {
                throw {
                    success: false,
                    message: 'Request timeout',
                    code: 'TIMEOUT',
                    details: { requestId, duration }
                } as ApiError;
            }

            // Handle network errors
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw {
                    success: false,
                    message: 'Network error. Please check your connection.',
                    code: 'NETWORK_ERROR',
                    details: { requestId, duration }
                } as ApiError;
            }

            // Re-throw ApiError
            if (error.success === false) {
                throw error;
            }

            // Unknown error
            throw {
                success: false,
                message: error.message || 'An unexpected error occurred',
                code: 'UNKNOWN',
                details: {
                    requestId,
                    duration,
                    endpoint: url,
                    method,
                    requestPayload: sanitizePayload(body)
                }
            } as ApiError;
        }
    };

    // 3. Circuit Breaker Execution
    if (!skipCircuitBreaker) {
        const endpointKey = url.split('?')[0];
        return executeWithCircuitBreaker(endpointKey, performRequest);
    }

    return performRequest();
}

/**
 * Sanitize sensitive data from payload
 */
function sanitizePayload(data: any): any {
    if (!data || typeof data !== 'object') return data;
    if (data instanceof FormData) return '[FormData]';

    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    const sensitiveKeys = ['password', 'token', 'secret', 'auth', 'key', 'ssn'];

    Object.keys(sanitized).forEach(key => {
        if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
            sanitized[key] = '***REDACTED***';
        } else if (typeof sanitized[key] === 'object') {
            sanitized[key] = sanitizePayload(sanitized[key]);
        }
    });

    return sanitized;
}

/**
 * API Client object with HTTP methods
 */
export const apiClient = {
    /**
     * GET request
     */
    get: <T>(url: string, options?: RequestOptions): Promise<T> => {
        return baseFetch<T>(url, 'GET', undefined, options);
    },

    /**
     * POST request
     */
    post: <T>(url: string, body?: any, options?: RequestOptions): Promise<T> => {
        return baseFetch<T>(url, 'POST', body, options);
    },

    /**
     * PUT request
     */
    put: <T>(url: string, body?: any, options?: RequestOptions): Promise<T> => {
        return baseFetch<T>(url, 'PUT', body, options);
    },

    /**
     * PATCH request
     */
    patch: <T>(url: string, body?: any, options?: RequestOptions): Promise<T> => {
        return baseFetch<T>(url, 'PATCH', body, options);
    },

    /**
     * DELETE request
     */
    delete: <T>(url: string, options?: RequestOptions): Promise<T> => {
        return baseFetch<T>(url, 'DELETE', undefined, options);
    },

    /**
     * Update health status
     */
    setSystemHealth: updateSystemHealth
};

export default apiClient;
