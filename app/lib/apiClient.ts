/**
 * Centralized API Client with typed responses and error handling
 */

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
}

// Default timeout in milliseconds
const DEFAULT_TIMEOUT = 30000;

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
 * Core fetch wrapper with error handling and timeout
 */
async function baseFetch<T>(
    url: string,
    method: string,
    body?: any,
    options: RequestOptions = {}
): Promise<T> {
    const { params, headers = {}, timeout = DEFAULT_TIMEOUT } = options;

    // Build URL with query params
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
        const queryString = buildQueryString(params);
        fullUrl = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
    }

    // Setup timeout
    const { controller, timeoutId } = createTimeoutController(timeout);

    try {
        const isFormData = body instanceof FormData;

        const response = await fetch(fullUrl, {
            method,
            headers: {
                ...(!isFormData && { 'Content-Type': 'application/json' }),
                ...headers,
            },
            body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = await parseErrorResponse(response);
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

        // Handle abort (timeout)
        if (error.name === 'AbortError') {
            throw {
                success: false,
                message: 'Request timeout',
                code: 'TIMEOUT',
            } as ApiError;
        }

        // Handle network errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw {
                success: false,
                message: 'Network error. Please check your connection.',
                code: 'NETWORK_ERROR',
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
        } as ApiError;
    }
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
};

export default apiClient;
