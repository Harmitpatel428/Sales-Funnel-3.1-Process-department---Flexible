"use client";

import { useWebSocket } from '@/lib/websocket/client';

interface ConnectionStatusProps {
    tenantId: string | undefined;
}

export function ConnectionStatus({ tenantId }: ConnectionStatusProps) {
    // Keep connection initialization behavior without rendering UI status badges.
    useWebSocket(tenantId);

    return null;
}
