import { NextResponse } from 'next/server';
import { getSession, invalidateSession } from '@/lib/auth';
import { emitSessionInvalidated } from '@/lib/websocket/server';
import { clearPermissionCache } from '@/lib/middleware/permissions';

export async function POST(req: Request) {
    try {
        const session = await getSession();

        if (session) {
            // Invalidate session in database
            await invalidateSession();

            try {
                // Broadcast to all user's connected clients
                await emitSessionInvalidated(
                    session.tenantId,
                    session.userId,
                    'user_logout'
                );

                // Clear permission cache
                clearPermissionCache(session.userId);
            } catch (wsError) {
                // Don't fail the HTTP logout if WS fails, but log it
                console.error("Failed to broadcast logout event:", wsError);
            }
        } else {
            // Even if getSession returns null, we should ensure cookie is cleared which invalidateSession does
            await invalidateSession();
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Logout error:", error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
