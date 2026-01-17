import { NextRequest } from 'next/server';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { registerClient, unregisterClient, emitPresenceUpdate } from '@/lib/websocket/server';
import { getEventsSince } from '@/lib/websocket/eventLog';
import { trackPresence, removePresence } from '@/lib/websocket/presence';

export async function GET(req: NextRequest) {
    if (req.headers.get('upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 400 });
    }

    try {
        const session = await getSessionByToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (!session) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { socket, response } = await upgradeWebSocket(req, session);
        return response;
    } catch (error) {
        console.error('WebSocket upgrade error:', error);
        return new Response('WebSocket upgrade failed', { status: 500 });
    }
}

/**
 * Upgrade HTTP connection to WebSocket (Edge Runtime compatible)
 */
async function upgradeWebSocket(req: NextRequest, session: any): Promise<{ socket: any, response: Response }> {
    // @ts-ignore - WebSocketPair is available in Edge Runtime / Miniflare / Workerd
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [any, any];

    server.accept();

    const tenantId = session.tenantId;
    const userId = session.userId;
    const userName = session.name || session.username || 'Unknown User';
    let lastEventId = 0;

    // Register client
    registerClient(tenantId, userId, server);

    // Heartbeat setup
    const heartbeatInterval = setInterval(() => {
        if (server.readyState === 1) { // WebSocket.OPEN
            server.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);

    // Track state for this specific connection
    let currentEntity: { type: string, id: string } | null = null;

    server.onmessage = async (event: any) => {
        try {
            const message = JSON.parse(event.data);

            if (message.action === 'sync') {
                lastEventId = message.lastEventId || 0;
                const missedEvents = await getEventsSince(tenantId, lastEventId, 100);
                server.send(JSON.stringify({
                    type: 'sync_response',
                    events: missedEvents,
                }));
            } else if (message.action === 'presence') {
                const { entityType, entityId, action } = message;
                currentEntity = { type: entityType, id: entityId };
                await trackPresence(tenantId, userId, userName, entityType, entityId, action);
                await emitPresenceUpdate(tenantId, entityType, entityId);
            } else if (message.type === 'pong') {
                // Heartbeat response (optional: track latency)
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };

    server.onclose = async () => {
        clearInterval(heartbeatInterval);
        unregisterClient(tenantId, server);

        if (currentEntity) {
            await removePresence(tenantId, userId, currentEntity.type, currentEntity.id);
            await emitPresenceUpdate(tenantId, currentEntity.type, currentEntity.id);
        } else {
            await removePresence(tenantId, userId);
        }
    };

    server.onerror = (error: any) => {
        console.error('WebSocket socket error:', error);
    };

    // Return the response for Next.js to finalize the upgrade
    const response = new Response(null, {
        status: 101,
        // @ts-ignore - webSocket property is recognized by Edge Runtime
        webSocket: client,
    });

    return { socket: server, response };
}
