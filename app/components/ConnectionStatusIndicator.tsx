'use client';

import { useRealtimeSync } from '@/app/hooks/useRealtimeSync';

/**
 * Premium UI component for displaying WebSocket connection status
 */
export function ConnectionStatusIndicator() {
    // Keep sync state subscription side-effects without rendering UI status badges.
    useRealtimeSync();

    return null;
}
