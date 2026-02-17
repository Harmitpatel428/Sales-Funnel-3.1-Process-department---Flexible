"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { isDuplicate } from './deduplication';
import { leadKeys } from '@/app/hooks/queries/useLeadsQuery';
import { caseKeys } from '@/app/hooks/queries/useCasesQuery';
import { documentKeys } from '@/app/hooks/queries/useDocumentsQuery';
import { reconcileWithServer } from '@/app/utils/optimistic';

const IMPORTANT_FIELDS: Record<string, string[]> = {
    lead: ['status', 'assignedToId', 'isDone', 'convertedToCaseId'],
    case: ['processStatus', 'assignedProcessUserId', 'closedAt'],
    document: ['status', 'verifiedById', 'rejectionReason']
};

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
const MAX_RECONNECT_ATTEMPTS = 5;

export function useWebSocket(tenantId?: string, options: { onMessage?: (msg: any) => void } = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const lastSequenceRef = useRef<number>(0);
    const reconnectAttemptsRef = useRef<number>(0);
    const queryClient = useQueryClient();
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const connect = useCallback(() => {
        if (!tenantId || socketRef.current?.readyState === WebSocket.OPEN) return;

        // Don't try to connect if we've failed too many times
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.warn('[WebSocket] Max reconnection attempts reached, stopping reconnection');
            return;
        }

        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

            socket.onopen = () => {
                setIsConnected(true);
                reconnectAttemptsRef.current = 0; // Reset on successful connection
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

            socket.onclose = (event) => {
                setIsConnected(false);
                // Only reconnect if it wasn't a clean close and we haven't exceeded attempts
                if (!event.wasClean && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttemptsRef.current++;
                    const delay = Math.min(3000 * reconnectAttemptsRef.current, 30000); // Exponential backoff, max 30s
                    setTimeout(connect, delay);
                }
            };

            socket.onerror = (error) => {
                // Log once and stop spamming
                if (reconnectAttemptsRef.current === 0) {
                    console.warn('[WebSocket] Connection failed. Real-time updates may be unavailable.');
                }
                // Error will trigger onclose, so reconnection is handled there
            };

            socketRef.current = socket;
        } catch (error) {
            console.warn('[WebSocket] Failed to create connection:', error);
            reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // Stop further attempts
        }
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
        case 'lead_updated':
            if (payload.id) {
                handleEntityUpdate(queryClient, leadKeys.detail(payload.id), leadKeys.lists(), payload, 'lead');
            }
            break;

        case 'lead_created':
        case 'lead_deleted':
            queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
            if (payload.id) {
                queryClient.invalidateQueries({ queryKey: leadKeys.detail(payload.id) });
            }
            break;

        case 'case_updated':
            if (payload.caseId) {
                handleEntityUpdate(queryClient, caseKeys.detail(payload.caseId), caseKeys.lists(), payload, 'case');
            }
            break;

        case 'case_created':
        case 'case_deleted':
            queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
            if (payload.caseId) {
                queryClient.invalidateQueries({ queryKey: caseKeys.detail(payload.caseId) });
            }
            break;

        case 'document_updated':
            if (payload.id || payload.documentId) {
                queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
                // Document updates are less critical for conflict resolution in lists typically,
                // but if we had a detail view we would use handleEntityUpdate
            }
            break;

        case 'document_created':
        case 'document_deleted':
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
            break;

        case 'session_invalidated':
            // Clear all local state, invalidate React Query cache, redirect to login
            queryClient.clear();
            localStorage.clear();
            sessionStorage.clear();
            // We should ideally use a router or window relocation, but this is a deep utility function.
            // Dispatching an event allows the UI component (hook) to handle the redirect cleanly.
            window.dispatchEvent(new CustomEvent('session-invalidated', { detail: payload }));
            break;

        case 'permissions_changed':
            // Invalidate permission-dependent queries, show notification
            queryClient.invalidateQueries();
            window.dispatchEvent(new CustomEvent('permission-changed', { detail: payload }));
            break;

        case 'account_locked':
            // Show lock notification, logout immediately
            window.dispatchEvent(new CustomEvent('account-locked', { detail: payload }));
            break;

        case 'session_expiring':
            // Show expiry warning modal
            window.dispatchEvent(new CustomEvent('session-expiring', { detail: payload }));
            break;
    }
}

/**
 * Generic handler for entity updates with conflict detection
 */
function handleEntityUpdate(
    queryClient: QueryClient,
    detailKey: readonly unknown[],
    listKey: readonly unknown[],
    driver: any, // The payload from server
    entityType: 'lead' | 'case'
) {
    const currentData: any = queryClient.getQueryData(detailKey);
    const localEntity = currentData?.data;

    // Determine the base version:
    // 1. If we have a stored __lastKnownGood on the optimistic entity, use it.
    // 2. Fallback to the server payload itself (driver) if unavailable.
    //    (This implies if we aren't tracking a base, we assume no conflict against the server's truth)
    const baseEntity = (localEntity as any)?.__lastKnownGood || driver;

    if (localEntity) {
        const result = reconcileWithServer(
            localEntity,
            driver,
            baseEntity,
            IMPORTANT_FIELDS[entityType]
        );

        if (result.status === 'success') {
            // No conflict (or auto-resolved), apply server update
            queryClient.setQueryData(detailKey, { success: true, data: result.entity });
            queryClient.invalidateQueries({ queryKey: listKey });
        } else {
            // Genuine conflict detected
            window.dispatchEvent(new CustomEvent('app-conflict', {
                detail: {
                    entityType,
                    conflicts: result.conflicts,
                    optimistic: result.optimistic,
                    server: result.server,
                    base: result.base,
                }
            }));
        }
    } else {
        // No local state, just update
        queryClient.setQueryData(detailKey, { success: true, data: driver });
        queryClient.invalidateQueries({ queryKey: listKey });
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
