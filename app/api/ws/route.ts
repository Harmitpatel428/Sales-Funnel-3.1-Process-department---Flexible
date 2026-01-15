import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { registerClient, unregisterClient, broadcastToTenant } from '@/lib/websocket/server';
import { storeEvent, getEventsSince, getNextSequenceNumber } from '@/lib/websocket/eventLog';
import { trackPresence, removePresence } from '@/lib/websocket/presence';
import { v4 as uuidv4 } from 'uuid';

// Map to track WebSocket connections with metadata
const connections = new Map<any, {
    tenantId: string;
    userId: string;
    lastEventId: number;
    heartbeatInterval: NodeJS.Timeout;
}>();

export async function GET(req: NextRequest) {
    // Check for WebSocket upgrade
    const upgrade = req.headers.get('upgrade');
    if (upgrade !== 'websocket') {
        return new Response('Expected WebSocket', { status: 400 });
    }

    try {
        // Authenticate
        const session = await getSession();
        if (!session) {
            return new Response('Unauthorized', { status: 401 });
        }

        // Get WebSocket from request (Next.js 15+ support)
        // Note: The actual implementation of upgradeWebSocket depends on the environment
        const { socket, response } = await upgradeWebSocket(req);

        const tenantId = session.tenantId;
        const userId = session.userId;
        let lastEventId = 0;

        // Register client
        registerClient(tenantId, userId, socket);
        connections.set(socket, {
            tenantId,
            userId,
            lastEventId,
            heartbeatInterval: setInterval(() => {
                if (socket.readyState === 1) { // WebSocket.OPEN
                    socket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000), // Heartbeat every 30 seconds
        });

        // Handle messages
        socket.onmessage = async (event: any) => {
            try {
                const message = JSON.parse(event.data);

                if (message.action === 'sync') {
                    // Client requesting missed events
                    lastEventId = message.lastEventId || 0;
                    const missedEvents = await getEventsSince(tenantId, lastEventId, 100);

                    socket.send(JSON.stringify({
                        type: 'sync_response',
                        events: missedEvents,
                    }));
                } else if (message.action === 'presence') {
                    // Track user presence
                    await trackPresence(tenantId, userId, message.entityType, message.entityId, message.action);
                } else if (message.type === 'pong') {
                    // Heartbeat response
                    const conn = connections.get(socket);
                    if (conn) conn.lastEventId = message.lastEventId || conn.lastEventId;
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        };

        // Handle close
        socket.onclose = async () => {
            const conn = connections.get(socket);
            if (conn) {
                clearInterval(conn.heartbeatInterval);
                unregisterClient(tenantId, socket);
                await removePresence(tenantId, userId);
                connections.delete(socket);
            }
        };

        // Handle errors
        socket.onerror = (error: any) => {
            console.error('WebSocket error:', error);
        };

        return response;
    } catch (error) {
        console.error('WebSocket upgrade error:', error);
        return new Response('WebSocket upgrade failed', { status: 500 });
    }
}

/**
 * Upgrade HTTP connection to WebSocket
 * This is a simplified version - actual implementation depends on Next.js version
 */
async function upgradeWebSocket(req: NextRequest): Promise<{ socket: any, response: Response }> {
    // Implementation varies by Next.js version
    // For Next.js 15+, use native WebSocket support if available in the runtime

    // NOTE: In many Next.js environments, this still needs to be handled at the server level (e.g., custom server)
    // or via a specialized runtime like Vercel's edge with WebSockets.
    // For standard Node.js runtime in Next.js, this is a placeholder.
    throw new Error('WebSocket upgrade not yet implemented for this Next.js version. Requires custom server or specific runtime support.');
}
