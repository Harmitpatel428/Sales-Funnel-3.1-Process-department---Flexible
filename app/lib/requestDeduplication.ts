/**
 * Request Deduplication Utility
 * 
 * Tracks in-flight requests and returns existing promises for duplicate requests.
 * React Query handles this internally for queries, but this is useful for
 * non-query requests like one-off API calls.
 */

// Map to track in-flight requests
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Execute a fetch with deduplication.
 * If a request with the same key is already in-flight, return the existing promise.
 * 
 * @param key - Unique key identifying the request
 * @param fetcher - Function that returns a promise with the request
 * @returns Promise with the request result
 */
export async function deduplicatedFetch<T>(
    key: string,
    fetcher: () => Promise<T>
): Promise<T> {
    // Check if request is already in-flight
    const existingRequest = inFlightRequests.get(key);
    if (existingRequest) {
        return existingRequest;
    }

    // Create new request promise
    const requestPromise = fetcher()
        .then((result) => {
            // Remove from map on success
            inFlightRequests.delete(key);
            return result;
        })
        .catch((error) => {
            // Remove from map on error
            inFlightRequests.delete(key);
            throw error;
        });

    // Store in map
    inFlightRequests.set(key, requestPromise);

    return requestPromise;
}

/**
 * Generate a consistent cache key from request parameters
 * 
 * @param base - Base identifier (e.g., 'leads', 'cases')
 * @param params - Optional parameters to include in key
 * @returns Cache key string
 */
export function generateRequestKey(
    base: string,
    params?: Record<string, any>
): string {
    if (!params || Object.keys(params).length === 0) {
        return base;
    }

    // Sort keys for consistent ordering
    const sortedParams = Object.keys(params)
        .sort()
        .reduce((acc, key) => {
            const value = params[key];
            if (value !== undefined && value !== null) {
                acc[key] = value;
            }
            return acc;
        }, {} as Record<string, any>);

    return `${base}:${JSON.stringify(sortedParams)}`;
}

/**
 * Clear all in-flight requests (useful for testing or cleanup)
 */
export function clearInFlightRequests(): void {
    inFlightRequests.clear();
}

/**
 * Get count of in-flight requests (useful for debugging)
 */
export function getInFlightCount(): number {
    return inFlightRequests.size;
}
