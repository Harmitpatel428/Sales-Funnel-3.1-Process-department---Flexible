'use client';

/**
 * React Query Provider Component
 * 
 * This component wraps the application with the QueryClientProvider
 * and includes the ReactQueryDevtools for development.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ReactNode, useEffect } from 'react';
import { getQueryClient } from '../lib/queryClient';
import { initializeOfflineQueueListeners, processQueue, hasPendingItems } from '../utils/offlineQueue';

import { useTenant } from '../context/TenantContext';
import { RealtimeSyncProvider } from './RealtimeSyncProvider';

interface QueryProviderProps {
    children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
    const queryClient = getQueryClient();

    // Initialize offline queue listeners
    useEffect(() => {
        const cleanup = initializeOfflineQueueListeners(
            // onOnline callback
            async () => {
                console.log('[QueryProvider] Online - processing offline queue');
                // Process any queued mutations
                const results = await processQueue();

                if (results.success.length > 0) {
                    console.log(`[QueryProvider] Processed ${results.success.length} queued items`);
                    // Invalidate all queries to refresh data
                    queryClient.invalidateQueries();
                }

                if (results.failed.length > 0) {
                    console.warn(`[QueryProvider] ${results.failed.length} items failed permanently`);
                }
            },
            // onOffline callback
            () => {
                console.log('[QueryProvider] Offline - mutations will be queued');
            }
        );

        // Check for pending items on mount
        if (hasPendingItems() && navigator.onLine) {
            console.log('[QueryProvider] Found pending queue items, processing...');
            processQueue().then((results) => {
                if (results.success.length > 0) {
                    queryClient.invalidateQueries();
                }
            });
        }

        return cleanup;
    }, [queryClient]);

    return (
        <QueryClientProvider client={queryClient}>
            <RealtimeSyncProvider>
                {children}
            </RealtimeSyncProvider>
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}
