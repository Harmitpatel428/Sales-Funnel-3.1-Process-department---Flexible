'use client';

import { useWebSocket } from '@/lib/websocket/client';
import { useTenant } from '@/app/context/TenantContext';

/**
 * Hook to access global real-time synchronization state
 */
export function useRealtimeSync() {
    const { currentTenant } = useTenant();
    const { isConnected, connectionState } = useWebSocket(currentTenant?.id);

    return {
        isConnected,
        connectionState,
        tenantId: currentTenant?.id
    };
}
