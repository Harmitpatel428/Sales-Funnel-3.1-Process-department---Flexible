'use client';

import { QueryClient } from '@tanstack/react-query';

/**
 * Create and configure the QueryClient with default options
 * for React Query v5
 */
export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // Data is considered fresh for 30 seconds
                staleTime: 30000,
                // Unused data is kept in cache for 5 minutes
                gcTime: 300000,
                // Retry failed requests 3 times
                retry: 3,
                // Exponential backoff: 1s, 2s, 4s, max 30s
                retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
                // Refetch when user returns to tab
                refetchOnWindowFocus: true,
                // Refetch when network reconnects
                refetchOnReconnect: true,
                // Refetch when component mounts if data is stale
                refetchOnMount: true,
            },
            mutations: {
                // Retry failed mutations twice
                retry: 2,
                retryDelay: 1000,
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
