"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

export type WebSocketEventType =
    | 'lead_created' | 'lead_updated' | 'lead_deleted'
    | 'case_created' | 'case_updated' | 'case_deleted'
    | 'report_generated' | 'notification';

interface WebSocketMessage {
    type: WebSocketEventType;
    tenantId: string;
    payload: any;
    timestamp: string;
}

interface UseWebSocketOptions {
    onMessage?: (message: WebSocketMessage) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Event) => void;
    autoReconnect?: boolean;
    reconnectInterval?: number;
}

export function useWebSocket(
    tenantId: string | undefined,
    events: WebSocketEventType[],
    options: UseWebSocketOptions = {}
) {
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const {
        onMessage, onConnect, onDisconnect, onError,
        autoReconnect = true, reconnectInterval = 5000
    } = options;

    const connect = useCallback(() => {
        if (!tenantId || typeof window === 'undefined') return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/reports/realtime?tenantId=${tenantId}`;

        try {
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                setIsConnected(true);
                onConnect?.();
                // Subscribe to events
                ws.send(JSON.stringify({ action: 'subscribe', events }));
            };

            ws.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    if (events.includes(message.type)) {
                        setLastMessage(message);
                        onMessage?.(message);
                    }
                } catch (err) {
                    console.error('Failed to parse WebSocket message:', err);
                }
            };

            ws.onclose = () => {
                setIsConnected(false);
                onDisconnect?.();
                if (autoReconnect) {
                    reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval);
                }
            };

            ws.onerror = (error) => {
                onError?.(error);
            };

            wsRef.current = ws;
        } catch (err) {
            console.error('Failed to create WebSocket:', err);
        }
    }, [tenantId, events, onMessage, onConnect, onDisconnect, onError, autoReconnect, reconnectInterval]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsConnected(false);
    }, []);

    const send = useCallback((data: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    useEffect(() => {
        connect();
        return () => disconnect();
    }, [connect, disconnect]);

    return { isConnected, lastMessage, send, connect, disconnect };
}

/**
 * Hook for subscribing to specific entity updates
 */
export function useRealtimeUpdates(
    tenantId: string | undefined,
    onLeadUpdate?: (lead: any) => void,
    onCaseUpdate?: (caseData: any) => void
) {
    const events: WebSocketEventType[] = [
        'lead_created', 'lead_updated', 'lead_deleted',
        'case_created', 'case_updated', 'case_deleted'
    ];

    return useWebSocket(tenantId, events, {
        onMessage: (message) => {
            if (message.type.startsWith('lead_')) {
                onLeadUpdate?.(message.payload);
            } else if (message.type.startsWith('case_')) {
                onCaseUpdate?.(message.payload);
            }
        }
    });
}
