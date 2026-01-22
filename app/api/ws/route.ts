import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionByToken } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/authConfig';
import { registerClient, unregisterClient, emitPresenceUpdate } from '@/lib/websocket/server';
import { getEventsSince } from '@/lib/websocket/eventLog';
import { trackPresence, removePresence } from '@/lib/websocket/presence';

/**
 * GET /api/ws
 * WebSocket upgrade endpoint
 * 
 * NOTE: This endpoint cannot use `withApiHandler` because:
 * 1. WebSocket upgrade requires special Response handling (status 101)
 * 2. The handler must return a Response with webSocket property for Edge Runtime
 * 3. Standard Next.js response wrapping would break the WebSocket handshake
 * 
 * Auth is implemented manually using the same `getSessionByToken` pattern
 * used by `withApiHandler` to maintain equivalent auth/error handling.
 */
export async function GET(req: NextRequest) {
    // Note: This WebSocket implementation requires Edge Runtime (Vercel/Cloudflare Workers).
    // WebSocketPair API (line 32) is not available in Node.js runtime.
    // Expected behavior: Connection will fail with 500 in standard Next.js dev server.
    // To enable: Add `export const runtime = 'edge'` or deploy to Edge-compatible platform.

    if (req.headers.get('upgrade') !== 'websocket') {
        return new Response(
            JSON.stringify({ success: false, error: 'INVALID_REQUEST', message: 'Expected WebSocket upgrade' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    try {
        // Auth check - same pattern as withApiHandler
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        const session = await getSessionByToken(sessionToken);

        if (!session) {
            return new Response(
                JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const { socket, response } = await upgradeWebSocket(req, session);
        return response;
    } catch (error) {
        console.error('WebSocket upgrade error:', error);
        return new Response(
            JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'WebSocket upgrade failed' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
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
