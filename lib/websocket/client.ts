"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { isDuplicate } from './deduplication';

export interface WebSocketMessage {
    id: string;
    sequenceNumber: number;
    tenantId: string;
    eventType: string;
    payload: any;
    timestamp: string;
}

/**
 * Hook for managing WebSocket connection
 */
export function useWebSocket(tenantId?: string, options: { onMessage?: (msg: any) => void } = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const lastSequenceRef = useRef<number>(0);
    const queryClient = useQueryClient();
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const connect = useCallback(() => {
        if (!tenantId || socketRef.current?.readyState === WebSocket.OPEN) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

        socket.onopen = () => {
            setIsConnected(true);
            // Sync missed events
            socket.send(JSON.stringify({
                action: 'sync',
                lastEventId: lastSequenceRef.current,
            }));
        };

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                if (message.type === 'sync_response') {
                    // Process missed events
                    for (const ev of (message.events || [])) {
                        if (!isDuplicate(ev.id)) {
                            handleMessage(ev, queryClient);
                            optionsRef.current.onMessage?.(ev);
                            if (ev.sequenceNumber > lastSequenceRef.current) {
                                lastSequenceRef.current = ev.sequenceNumber;
                            }
                        }
                    }
                } else if (message.id && !isDuplicate(message.id)) {
                    handleMessage(message, queryClient);
                    optionsRef.current.onMessage?.(message);
                    if (message.sequenceNumber > lastSequenceRef.current) {
                        lastSequenceRef.current = message.sequenceNumber;
                    }
                } else if (message.type === 'ping') {
                    socket.send(JSON.stringify({ type: 'pong', lastEventId: lastSequenceRef.current }));
                } else {
                    // Other messages like presence
                    optionsRef.current.onMessage?.(message);
                }
            } catch (error) {
                console.error('WebSocket message parsing error:', error);
            }
        };

        socket.onclose = () => {
            setIsConnected(false);
            // Reconnect after 3 seconds
            setTimeout(connect, 3000);
        };

        socketRef.current = socket;
    }, [tenantId, queryClient]);

    useEffect(() => {
        connect();
        return () => {
            socketRef.current?.close();
        };
    }, [connect]);

    const sendMessage = (action: string, data: any) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ action, ...data }));
        }
    };

    return { isConnected, sendMessage };
}

/**
 * Handle incoming WebSocket messages and update cache
 */
function handleMessage(message: WebSocketMessage, queryClient: QueryClient) {
    const { eventType, payload } = message;

    switch (eventType) {
        case 'lead_created':
        case 'lead_updated':
        case 'lead_deleted':
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            if (payload.id) queryClient.invalidateQueries({ queryKey: ['lead', payload.id] });
            break;

        case 'case_created':
        case 'case_updated':
        case 'case_deleted':
            queryClient.invalidateQueries({ queryKey: ['cases'] });
            if (payload.caseId) queryClient.invalidateQueries({ queryKey: ['case', payload.caseId] });
            break;

        case 'document_created':
        case 'document_updated':
        case 'document_deleted':
            queryClient.invalidateQueries({ queryKey: ['documents'] });
            if (payload.documentId) queryClient.invalidateQueries({ queryKey: ['document', payload.documentId] });
            break;
    }
}

/**
 * Hook for tracking presence on a specific entity
 */
export function usePresence(
    tenantId: string | undefined,
    entityType: 'lead' | 'case' | 'document',
    entityId: string,
    currentUser?: { id: string, name: string }
) {
    const [activeUsers, setActiveUsers] = useState<any[]>([]);

    const { isConnected, sendMessage } = useWebSocket(tenantId, {
        onMessage: (message) => {
            if (message.type?.startsWith('presence_')) {
                const data = message.payload;
                if (data.entityType === entityType && data.entityId === entityId) {
                    if (message.type === 'presence_left') {
                        setActiveUsers(prev => prev.filter(u => u.userId !== data.userId));
                    } else {
                        setActiveUsers(prev => {
                            const exists = prev.find(u => u.userId === data.userId);
                            if (exists) return prev.map(u => u.userId === data.userId ? data : u);
                            return [...prev, data];
                        });
                    }
                }
            } else if (message.type === 'initial_presence') {
                const data = message.payload;
                if (data.entityType === entityType && data.entityId === entityId) {
                    setActiveUsers(data.users || []);
                }
            }
        }
    });

    useEffect(() => {
        if (isConnected && entityId && currentUser) {
            sendMessage('presence', {
                entityType,
                entityId,
                action: 'viewing',
                userId: currentUser.id,
                userName: currentUser.name
            });

            const interval = setInterval(() => {
                sendMessage('presence', {
                    entityType,
                    entityId,
                    action: 'heartbeat'
                });
            }, 30000);

            return () => {
                clearInterval(interval);
                sendMessage('presence', {
                    entityType,
                    entityId,
                    action: 'left'
                });
            };
        }
    }, [isConnected, entityId, entityType, sendMessage, currentUser]);

    return { activeUsers, isConnected };
}
