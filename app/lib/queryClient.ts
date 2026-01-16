'use client';

import { QueryClient } from '@tanstack/react-query';
import { classifyError } from '../utils/errorHandling';

/**
 * Create and configure the QueryClient with default options
 * for React Query v5 with enterprise error handling
 */
export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // Data is considered fresh for 30 seconds
                staleTime: 30000,
                // Unused data is kept in cache for 5 minutes
                gcTime: 300000,

                // Smart retry logic based on error classification
                retry: (failureCount, error) => {
                    const classified = classifyError(error);
                    if (!classified.isRetryable) return false;

                    // Transient errors retry more (5 times)
                    const maxRetries = classified.category === 'TRANSIENT' ? 5 : 2;
                    return failureCount < maxRetries;
                },

                // Exponential backoff with jitter
                retryDelay: (attemptIndex, error) => {
                    const classified = classifyError(error);

                    // Base backoff: 1s, 2s, 4s, 8s, 16s...
                    const baseDelay = Math.min(1000 * Math.pow(2, attemptIndex), 30000);

                    // Add random jitter (0-1000ms) to prevent thundering herd
                    const jitter = Math.random() * 1000;

                    return baseDelay + jitter;
                },

                // Refetch when user returns to tab
                refetchOnWindowFocus: true,
                // Refetch when network reconnects
                refetchOnReconnect: true,
                // Refetch when component mounts if data is stale
                refetchOnMount: true,
            },
            mutations: {
                // Retry failed mutations based on error type
                retry: (failureCount, error) => {
                    const classified = classifyError(error);
                    // Only retry transient errors for mutations (e.g. network)
                    // Validation/Conflict errors typically shouldn't retry automatically like this
                    // unless properly handled or idempotent (assumed handled by optimistic updates rollback usually)
                    if (classified.category === 'TRANSIENT') return failureCount < 3;
                    return false;
                },
                retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 10000),
            },
        },
    });
}

// Singleton instance for client-side
let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient(): QueryClient {
    if (typeof window === 'undefined') {
        // Server: always create a new QueryClient
        return createQueryClient();
    } else {
        // Browser: use singleton pattern to avoid recreating on every render
        if (!browserQueryClient) {
            browserQueryClient = createQueryClient();
        }
        return browserQueryClient;
    }
}
