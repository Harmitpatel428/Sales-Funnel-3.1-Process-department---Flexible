'use client';

import { useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const SESSION_CHANNEL = 'crm-session-sync';

export interface TabMessage {
    type: 'logout' | 'session-refreshed' | 'permission-changed';
    timestamp: number;
    detail?: any; // For permission hashes etc
}

export function useMultiTabSync() {
    const channel = useRef<BroadcastChannel | null>(null);
    const queryClient = useQueryClient();

    const performLogout = () => {
        // We can dispatch a custom event that the UserContext or Layout listens to
        // or we can just redirect. Dispatching event is safer to allow cleanup.
        window.dispatchEvent(new CustomEvent('session-logout-requested'));
    };

    const refreshLocalSession = () => {
        queryClient.invalidateQueries({ queryKey: ['session'] });
    };

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;

        channel.current = new BroadcastChannel(SESSION_CHANNEL);

        channel.current.onmessage = (event: MessageEvent<TabMessage>) => {
            switch (event.data.type) {
                case 'logout':
                    // Logout in this tab
                    // console.log('Received logout signal from another tab');
                    performLogout();
                    break;
                case 'session-refreshed':
                    // Sync session state
                    refreshLocalSession();
                    break;
                case 'permission-changed':
                    // Invalidate caches
                    queryClient.invalidateQueries();
                    window.dispatchEvent(new CustomEvent('permission-changed', { detail: event.data.detail }));
                    break;
            }
        };

        return () => {
            channel.current?.close();
            channel.current = null;
        };
    }, [queryClient]);

    const broadcastLogout = () => {
        channel.current?.postMessage({ type: 'logout', timestamp: Date.now() });
    };

    const broadcastRefresh = () => {
        channel.current?.postMessage({ type: 'session-refreshed', timestamp: Date.now() });
    };

    return { broadcastLogout, broadcastRefresh };
}
