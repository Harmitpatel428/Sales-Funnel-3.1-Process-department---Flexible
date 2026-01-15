import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

const sessionActivityCache = new Map<string, number>();

export async function updateSessionActivity(req: NextRequest): Promise<void> {
    // Optimization: Skip for static assets and next internal routes
    if (
        req.nextUrl.pathname.startsWith('/_next') ||
        req.nextUrl.pathname.startsWith('/static') ||
        req.nextUrl.pathname.endsWith('.ico')
    ) {
        return;
    }

    const session = await getSession();
    if (!session) return;

    // Throttle updates to once per minute to reduce DB writes
    const lastUpdate = sessionActivityCache.get(session.sessionId);
    if (lastUpdate && Date.now() - lastUpdate < 60000) return;

    try {
        await prisma.session.update({
            where: { id: session.sessionId },
            data: { lastActivityAt: new Date() }
        });
        sessionActivityCache.set(session.sessionId, Date.now());

        // Cleanup cache occasionally to prevent memory leak (though Map limits are high)
        if (sessionActivityCache.size > 10000) {
            sessionActivityCache.clear();
        }
    } catch (error) {
        // Ignore errors here to not block the request
        console.error('Failed to update session activity:', error);
    }
}
