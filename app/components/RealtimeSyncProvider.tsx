'use client';

import React, { ReactNode } from 'react';
import { useWebSocket } from '@/lib/websocket/client';
import { useTenant } from '@/app/context/TenantContext';

interface RealtimeSyncProviderProps {
    children: ReactNode;
}

/**
 * Provider that initializes real-time sync and shows the global status indicator
 */
export function RealtimeSyncProvider({ children }: RealtimeSyncProviderProps) {
    const { currentTenant } = useTenant();

    // Initialize global WebSocket connection
    useWebSocket(currentTenant?.id);

    return <>{children}</>;
}
